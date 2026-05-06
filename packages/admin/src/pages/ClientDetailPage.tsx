import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { ArrowLeft, Wrench, Calendar, MapPin, Image, QrCode, Download } from 'lucide-react';
import QRCode from 'qrcode';

interface Client {
  id: string; name: string; company_name: string | null; phone: string;
  address: string | null; branch: string | null; service_frequency_months: number;
  qr_uuid: string | null;
}
interface Equipment { id: string; type: string; make: string | null; model: string | null; }
interface Visit { id: string; scheduled_date: string; status: string; notes: string | null; }
interface Transaction { id: string; amount: number; type: string; transaction_date: string; description: string | null; }

export function ClientDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [client, setClient] = useState<Client | null>(null);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [tab, setTab] = useState<'equipment' | 'visits' | 'finance' | 'qr'>('equipment');
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const qrGeneratedRef = useRef(false);

  useEffect(() => {
    if (!id) return;
    supabase.from('clients').select('*').eq('id', id).single().then(({ data }) => setClient(data));
    supabase.from('equipment').select('*').eq('client_id', id).order('created_at', { ascending: false }).then(({ data }) => setEquipment(data || []));
    supabase.from('service_visits').select('*').eq('client_id', id).order('scheduled_date', { ascending: false }).limit(20).then(({ data }) => setVisits(data || []));
    supabase.from('financial_transactions').select('*').eq('client_id', id).order('transaction_date', { ascending: false }).limit(20).then(({ data }) => setTransactions(data || []));
  }, [id]);

  // Generate QR code when client loads with qr_uuid
  useEffect(() => {
    if (!client?.qr_uuid || qrGeneratedRef.current) return;
    qrGeneratedRef.current = true;
    const checkinUrl = `${window.location.origin}/checkin/${client.qr_uuid}`;
    QRCode.toDataURL(checkinUrl, { width: 300, margin: 2, color: { dark: '#6366f1' } })
      .then(setQrDataUrl)
      .catch(console.error);
  }, [client?.qr_uuid]);

  // Reset qrGenerated when client changes
  useEffect(() => { qrGeneratedRef.current = false; }, [id]);

  if (!client) return <div className="text-gray-400">Loading...</div>;

  return (
    <div>
      <button onClick={() => navigate('/clients')} className="flex items-center gap-2 text-gray-400 hover:text-white mb-4 transition">
        <ArrowLeft className="w-4 h-4" /> Back to Clients
      </button>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6">
        <h1 className="text-2xl font-bold text-white">{client.name}</h1>
        <p className="text-gray-400">{client.company_name || 'Individual'}</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
          <div>
            <p className="text-xs text-gray-500">Phone</p>
            <p className="text-white">{client.phone}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Branch</p>
            <p className="text-white">{client.branch || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Service</p>
            <p className="text-white">Every {client.service_frequency_months} months</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Address</p>
            <p className="text-white">{client.address || '—'}</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        {(['equipment', 'visits', 'finance', 'qr'] as const).map((t) => (
          <button key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition ${
              tab === t ? 'bg-indigo-600 text-white' : 'bg-gray-900 text-gray-400 hover:text-white'
            }`}
          >{t}</button>
        ))}
      </div>

      {/* Equipment */}
      {tab === 'equipment' && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          {equipment.map((e) => (
            <div key={e.id} className="flex items-center gap-3 py-3 border-b border-gray-800 last:border-0">
              <Wrench className="w-4 h-4 text-indigo-400" />
              <div>
                <p className="text-white font-medium">{e.type}</p>
                <p className="text-sm text-gray-400">{[e.make, e.model].filter(Boolean).join(' ')}</p>
              </div>
            </div>
          ))}
          {equipment.length === 0 && <p className="text-gray-500 text-center py-4">No equipment registered</p>}
        </div>
      )}

      {/* Visits */}
      {tab === 'visits' && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          {visits.map((v) => (
            <div key={v.id} className="flex items-center gap-3 py-3 border-b border-gray-800 last:border-0">
              <Calendar className="w-4 h-4 text-emerald-400" />
              <div className="flex-1">
                <p className="text-white">{new Date(v.scheduled_date).toLocaleDateString('en-IN')}</p>
                {v.notes && <p className="text-sm text-gray-400">{v.notes}</p>}
              </div>
              <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                v.status === 'completed' ? 'bg-emerald-500/20 text-emerald-400' :
                v.status === 'scheduled' ? 'bg-amber-500/20 text-amber-400' :
                'bg-red-500/20 text-red-400'
              }`}>{v.status}</span>
            </div>
          ))}
          {visits.length === 0 && <p className="text-gray-500 text-center py-4">No visits recorded</p>}
        </div>
      )}

      {/* Finance */}
      {tab === 'finance' && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          {transactions.map((t) => (
            <div key={t.id} className="flex items-center justify-between py-3 border-b border-gray-800 last:border-0">
              <div>
                <p className="text-white">{t.description || t.type}</p>
                <p className="text-sm text-gray-400">{new Date(t.transaction_date).toLocaleDateString('en-IN')}</p>
              </div>
              <span className={`font-medium ${t.type === 'income' ? 'text-emerald-400' : 'text-red-400'}`}>
                {t.type === 'income' ? '+' : '-'}₹{Number(t.amount).toLocaleString('en-IN')}
              </span>
            </div>
          ))}
          {transactions.length === 0 && <p className="text-gray-500 text-center py-4">No transactions</p>}
        </div>
      )}

      {/* QR Code */}
      {tab === 'qr' && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          {client.qr_uuid ? (
            <>
              <div className="text-center mb-6">
                <h2 className="text-lg font-semibold text-white mb-1">Technician Check-In QR</h2>
                <p className="text-sm text-gray-400">
                  Print or share this QR code. Technicians scan it at the branch.
                </p>
              </div>
              <div className="flex justify-center mb-4">
                {qrDataUrl ? (
                  <img src={qrDataUrl} alt="Check-in QR Code"
                    className="rounded-xl border-2 border-gray-700 bg-white p-3"
                    style={{ width: 220, height: 220 }}
                  />
                ) : (
                  <div className="w-56 h-56 rounded-xl border-2 border-dashed border-gray-700 flex items-center justify-center">
                    <QrCode className="w-12 h-12 text-gray-600" />
                  </div>
                )}
              </div>
              <div className="flex justify-center gap-3">
                {qrDataUrl && (
                  <a href={qrDataUrl} download={`${client.name}-${client.branch || 'qr'}.png`}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-500 transition">
                    <Download className="w-4 h-4" /> Download QR
                  </a>
                )}
                {qrDataUrl && (
                  <button onClick={() => {
                    const printWindow = window.open('', '_blank');
                    if (printWindow) {
                      printWindow.document.write(`
                        <html><head><title>Check-In QR</title>
                        <style>body{display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
                        .card{text-align:center;font-family:system-ui}
                        h2{margin-bottom:8px}
                        p{color:#666;font-size:14px;margin-bottom:16px}
                        img{border:1px solid #ddd;border-radius:12px}
                        </style></head><body><div class="card">
                        <h2>${client.name}${client.branch ? ' - ' + client.branch : ''}</h2>
                        <p>Scan to check in</p>
                        <img src="${qrDataUrl}" width="240" height="240" />
                        </div></body></html>`);
                      printWindow.document.close();
                      printWindow.print();
                    }
                  }} className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-700 transition">
                    Print
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="text-center py-8">
              <QrCode className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-500">No QR code generated yet</p>
              <p className="text-gray-600 text-sm mt-1">Assign a branch to this client to generate a QR code</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
