import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { createClient } from '@supabase/supabase-js';
import { Camera, CheckCircle, Clock, Wrench, User, Phone, FileText, AlertCircle, Loader, ArrowLeft, ArrowRight, Pen } from 'lucide-react';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

interface ClientInfo { id: string; name: string; branch: string | null; address: string | null; }
interface Equipment { id: string; type: string; make: string | null; model: string | null; }

type Step = 'info' | 'equipment' | 'details' | 'photo' | 'signature' | 'submitting' | 'done';

const WORK_TYPES = ['maintenance', 'repair', 'inspection', 'installation'] as const;

export function CheckinPage() {
  const { qr_uuid } = useParams<{ qr_uuid: string }>();

  const [step, setStep] = useState<Step>('info');
  const [client, setClient] = useState<ClientInfo | null>(null);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Form state
  const [techName, setTechName] = useState('');
  const [techPhone, setTechPhone] = useState('');
  const [selectedEquipment, setSelectedEquipment] = useState<string[]>([]);
  const [workType, setWorkType] = useState<string>('maintenance');
  const [description, setDescription] = useState('');
  const [partsUsed, setPartsUsed] = useState('');
  const [hoursSpent, setHoursSpent] = useState('');
  const [photoData, setPhotoData] = useState<string | null>(null);
  const [gpsLat, setGpsLat] = useState<number | null>(null);
  const [gpsLng, setGpsLng] = useState<number | null>(null);

  // Signature
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  // Load client info
  useEffect(() => {
    if (!qr_uuid) { setError('Invalid QR code'); setLoading(false); return; }

    Promise.all([
      supabase.from('clients').select('id, name, branch, address').eq('qr_uuid', qr_uuid).single(),
      navigator.geolocation?.getCurrentPosition(
        (pos) => { setGpsLat(pos.coords.latitude); setGpsLng(pos.coords.longitude); },
        () => {} // silent fail
      ),
    ]).then(([{ data, error: clientErr }]) => {
      if (clientErr || !data) { setError('Branch not found. Invalid or expired QR code.'); setLoading(false); return; }
      setClient(data);
      return supabase.from('equipment').select('id, type, make, model').eq('client_id', data.id);
    }).then((eqResult) => {
      if (eqResult) {
        const { data: eq } = eqResult;
        setEquipment(eq || []);
      }
      setLoading(false);
    });
  }, [qr_uuid]);

  // Capture photo from camera
  const fileInputRef = useRef<HTMLInputElement>(null);
  const capturePhoto = () => fileInputRef.current?.click();

  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPhotoData(reader.result as string);
    reader.readAsDataURL(file);
  };

  // Signature canvas
  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDrawing(true);
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const x = ('touches' in e ? e.touches[0].clientX : e.clientX) - rect.left;
    const y = ('touches' in e ? e.touches[0].clientY : e.clientY) - rect.top;
    lastPos.current = { x, y };
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || !canvasRef.current || !lastPos.current) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d')!;
    const rect = canvas.getBoundingClientRect();
    const x = ('touches' in e ? e.touches[0].clientX : e.clientX) - rect.left;
    const y = ('touches' in e ? e.touches[0].clientY : e.clientY) - rect.top;

    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(x, y);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.stroke();
    lastPos.current = { x, y };
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    lastPos.current = null;
    if (canvasRef.current) {
      setSignatureData(canvasRef.current.toDataURL('image/png'));
    }
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d')!;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setSignatureData(null);
    }
  };

  // Submit
  const submitCheckin = async () => {
    setStep('submitting');
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/qr-checkin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          qr_uuid,
          tech_name: techName,
          tech_phone: techPhone || undefined,
          work_type: workType,
          description,
          equipment_ids: selectedEquipment.length > 0 ? selectedEquipment : undefined,
          photos: photoData ? [photoData] : undefined,
          parts_used: partsUsed || undefined,
          hours_spent: hoursSpent ? parseFloat(hoursSpent) : undefined,
          signature: signatureData || undefined,
          gps_latitude: gpsLat,
          gps_longitude: gpsLng,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setStep('done');
    } catch (err: any) {
      setError(err.message || 'Submit failed. Check your connection.');
      setStep('details'); // go back so they can retry
    }
  };

  const canProceed = () => {
    switch (step) {
      case 'info': return techName.trim().length >= 2;
      case 'equipment': return true; // optional
      case 'details': return description.trim().length >= 5;
      case 'photo': return true; // optional
      case 'signature': return true; // optional
      default: return false;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <Loader className="w-8 h-8 text-indigo-400 animate-spin" />
      </div>
    );
  }

  if (error && step !== 'submitting') {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-white mb-2">Check-In Failed</h1>
          <p className="text-gray-400">{error}</p>
          <button onClick={() => { setError(''); setStep('info'); }}
            className="mt-6 px-6 py-3 bg-indigo-600 text-white rounded-xl text-sm font-medium">
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (step === 'done') {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
        <div className="text-center">
          <CheckCircle className="w-16 h-16 text-emerald-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white mb-2">Check-In Complete!</h1>
          <p className="text-gray-400 mb-1">{client?.name}</p>
          {client?.branch && <p className="text-gray-500 text-sm">{client.branch}</p>}
          <p className="text-gray-500 text-sm mt-4">Your report has been submitted successfully.</p>
          <button onClick={() => { setStep('info'); setPhotoData(null); setSignatureData(null); setDescription(''); setPartsUsed(''); setHoursSpent(''); setSelectedEquipment([]); }}
            className="mt-6 px-6 py-3 bg-indigo-600 text-white rounded-xl text-sm font-medium">
            New Check-In
          </button>
        </div>
      </div>
    );
  }

  const stepLabels: Record<Step, string> = {
    info: 'Your Info', equipment: 'Equipment', details: 'Work Details',
    photo: 'Photo', signature: 'Signature', submitting: 'Submitting...', done: 'Done'
  };
  const steps: Step[] = ['info', 'equipment', 'details', 'photo', 'signature'];
  const stepIndex = steps.indexOf(step);

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      {/* Header */}
      <div className="bg-gray-900 border-b border-gray-800 px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          {stepIndex > 0 ? (
            <button onClick={() => setStep(steps[stepIndex - 1])} className="text-gray-400">
              <ArrowLeft className="w-5 h-5" />
            </button>
          ) : <div className="w-5" />}
          <h1 className="text-white font-semibold text-sm">Service Check-In</h1>
          <div className="w-5" />
        </div>
        {/* Client info */}
        {client && (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold">
              {client.name.charAt(0)}
            </div>
            <div>
              <p className="text-white text-sm font-medium">{client.name}</p>
              {client.branch && <p className="text-gray-500 text-xs">{client.branch}</p>}
            </div>
          </div>
        )}
      </div>

      {/* Progress */}
      <div className="px-4 py-3 flex gap-1">
        {steps.map((s, i) => (
          <div key={s}
            className={`h-1 flex-1 rounded-full transition-colors ${
              i < stepIndex ? 'bg-indigo-500' : i === stepIndex ? 'bg-indigo-400' : 'bg-gray-800'
            }`}
          />
        ))}
      </div>
      <p className="text-center text-xs text-gray-500 -mt-1 mb-2">{stepLabels[step]}</p>

      {/* Step content */}
      <div className="flex-1 px-4 pb-6 overflow-auto">
        {/* Step 1: Technician Info */}
        {step === 'info' && (
          <div className="space-y-4">
            <div>
              <label className="flex items-center gap-2 text-sm text-gray-400 mb-1.5">
                <User className="w-4 h-4" /> Your Name *
              </label>
              <input autoFocus value={techName} onChange={(e) => setTechName(e.target.value)}
                placeholder="Enter your full name"
                className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-white text-sm placeholder-gray-600 focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="flex items-center gap-2 text-sm text-gray-400 mb-1.5">
                <Phone className="w-4 h-4" /> Phone (optional)
              </label>
              <input type="tel" value={techPhone} onChange={(e) => setTechPhone(e.target.value)}
                placeholder="+91 98765 43210"
                className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-white text-sm placeholder-gray-600 focus:border-indigo-500 focus:outline-none"
              />
            </div>
            {gpsLat && (
              <p className="text-xs text-emerald-500 flex items-center gap-1">
                <CheckCircle className="w-3 h-3" /> Location captured
              </p>
            )}
          </div>
        )}

        {/* Step 2: Equipment */}
        {step === 'equipment' && (
          <div className="space-y-3">
            <p className="text-sm text-gray-400">Select equipment serviced (optional)</p>
            {equipment.length === 0 ? (
              <p className="text-gray-600 text-sm py-8 text-center">No equipment registered for this branch</p>
            ) : (
              equipment.map((eq) => {
                const selected = selectedEquipment.includes(eq.id);
                return (
                  <button key={eq.id}
                    onClick={() => setSelectedEquipment(prev =>
                      selected ? prev.filter(id => id !== eq.id) : [...prev, eq.id]
                    )}
                    className={`w-full text-left p-4 rounded-xl border transition ${
                      selected ? 'border-indigo-500 bg-indigo-500/10' : 'border-gray-800 bg-gray-900'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Wrench className={`w-5 h-5 ${selected ? 'text-indigo-400' : 'text-gray-500'}`} />
                      <div>
                        <p className="text-white text-sm font-medium">{eq.type}</p>
                        <p className="text-gray-500 text-xs">{[eq.make, eq.model].filter(Boolean).join(' ')}</p>
                      </div>
                      {selected && <CheckCircle className="w-5 h-5 text-indigo-400 ml-auto" />}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        )}

        {/* Step 3: Work Details */}
        {step === 'details' && (
          <div className="space-y-4">
            <div>
              <label className="text-sm text-gray-400 block mb-1.5">Work Type</label>
              <div className="grid grid-cols-2 gap-2">
                {WORK_TYPES.map((wt) => (
                  <button key={wt}
                    onClick={() => setWorkType(wt)}
                    className={`px-4 py-3 rounded-xl text-sm font-medium capitalize border transition ${
                      workType === wt
                        ? 'border-indigo-500 bg-indigo-500/10 text-indigo-400'
                        : 'border-gray-800 bg-gray-900 text-gray-400'
                    }`}
                  >{wt}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="flex items-center gap-2 text-sm text-gray-400 mb-1.5">
                <FileText className="w-4 h-4" /> Description *
              </label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe what work was done..."
                rows={4}
                className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-white text-sm placeholder-gray-600 focus:border-indigo-500 focus:outline-none resize-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="flex items-center gap-2 text-sm text-gray-400 mb-1.5">
                  <Wrench className="w-4 h-4" /> Parts Used
                </label>
                <input value={partsUsed} onChange={(e) => setPartsUsed(e.target.value)}
                  placeholder="e.g. 2 x Battery"
                  className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-white text-sm placeholder-gray-600 focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="flex items-center gap-2 text-sm text-gray-400 mb-1.5">
                  <Clock className="w-4 h-4" /> Hours
                </label>
                <input type="number" step="0.5" min="0" max="24"
                  value={hoursSpent} onChange={(e) => setHoursSpent(e.target.value)}
                  placeholder="1.5"
                  className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-white text-sm placeholder-gray-600 focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Photo */}
        {step === 'photo' && (
          <div className="space-y-4">
            <p className="text-sm text-gray-400">Take a photo of the work done (optional)</p>
            <input ref={fileInputRef} type="file" accept="image/*" capture="environment"
              onChange={handlePhotoCapture} className="hidden" />
            {photoData ? (
              <div className="relative rounded-xl overflow-hidden border border-gray-800">
                <img src={photoData} alt="Work photo" className="w-full object-cover" />
                <button onClick={() => setPhotoData(null)}
                  className="absolute top-2 right-2 bg-red-500/80 text-white text-xs px-3 py-1.5 rounded-lg">
                  Retake
                </button>
              </div>
            ) : (
              <button onClick={capturePhoto}
                className="w-full aspect-[4/3] bg-gray-900 border-2 border-dashed border-gray-700 rounded-xl flex flex-col items-center justify-center gap-3 hover:border-indigo-500 transition">
                <Camera className="w-10 h-10 text-gray-600" />
                <p className="text-gray-500 text-sm">Tap to take photo</p>
              </button>
            )}
          </div>
        )}

        {/* Step 5: Signature */}
        {step === 'signature' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-400">Sign here (optional)</p>
              <button onClick={clearSignature} className="text-xs text-gray-500 flex items-center gap-1">
                <Pen className="w-3 h-3" /> Clear
              </button>
            </div>
            <div className="bg-white rounded-xl overflow-hidden border border-gray-700 touch-none"
              style={{ height: 180 }}>
              <canvas ref={canvasRef} width={400} height={180}
                onMouseDown={startDrawing} onMouseMove={draw} onMouseUp={stopDrawing} onMouseLeave={stopDrawing}
                onTouchStart={startDrawing} onTouchMove={draw} onTouchEnd={stopDrawing}
                className="w-full h-full"
              />
            </div>
            {signatureData && (
              <p className="text-xs text-emerald-500 flex items-center gap-1">
                <CheckCircle className="w-3 h-3" /> Signature captured
              </p>
            )}
          </div>
        )}

        {/* Submitting */}
        {step === 'submitting' && (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader className="w-10 h-10 text-indigo-400 animate-spin mb-4" />
            <p className="text-gray-400 text-sm">Submitting your report...</p>
          </div>
        )}
      </div>

      {/* Bottom nav */}
      {step !== 'submitting' && (
        <div className="px-4 py-4 border-t border-gray-800 bg-gray-900">
          {step !== 'signature' ? (
            <button
              onClick={() => setStep(steps[stepIndex + 1])}
              disabled={!canProceed()}
              className={`w-full py-3.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition ${
                canProceed() ? 'bg-indigo-600 text-white hover:bg-indigo-500' : 'bg-gray-800 text-gray-600'
              }`}
            >
              Continue <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button onClick={submitCheckin}
              className="w-full py-3.5 rounded-xl text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-500 transition flex items-center justify-center gap-2">
              <CheckCircle className="w-4 h-4" /> Submit Report
            </button>
          )}
        </div>
      )}
    </div>
  );
}
