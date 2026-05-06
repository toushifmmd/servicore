import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Calendar, User, Wrench, Clock, MapPin, Image, QrCode, Search, Filter, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface FieldReport {
  id: string;
  client_id: string;
  client_name: string;
  client_branch: string | null;
  tech_name: string;
  tech_phone: string | null;
  work_type: string;
  notes: string;
  parts_used: string | null;
  hours_spent: number | null;
  photo_url: string | null;
  signature_data: string | null;
  completed_date: string;
  gps_latitude: number | null;
  gps_longitude: number | null;
  photos_count: number;
}

export function FieldReportsPage() {
  const navigate = useNavigate();
  const [reports, setReports] = useState<FieldReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [workTypeFilter, setWorkTypeFilter] = useState<string | null>(null);
  const [selectedReport, setSelectedReport] = useState<FieldReport | null>(null);

  useEffect(() => {
    loadReports();
  }, []);

  const loadReports = async () => {
    setLoading(true);
    // Fetch QR check-in visits with client name and photo count
    const { data: visits, error } = await supabase
      .from('service_visits')
      .select(`
        id, client_id, tech_name, tech_phone, work_type, notes,
        parts_used, hours_spent, photo_url, signature_data,
        completed_date, checkin_source,
        gps_latitude, gps_longitude,
        clients!inner(name, branch)
      `)
      .eq('checkin_source', 'qr')
      .order('completed_date', { ascending: false })
      .limit(100);

    if (error) { console.error(error); setLoading(false); return; }

    // Get photo counts per visit
    const visitIds = visits.map((v: any) => v.id);
    const { data: photoCounts } = await supabase
      .from('service_photos')
      .select('visit_id')
      .in('visit_id', visitIds);

    const countMap: Record<string, number> = {};
    photoCounts?.forEach((p: any) => { countMap[p.visit_id] = (countMap[p.visit_id] || 0) + 1; });

    const mapped: FieldReport[] = visits.map((v: any) => ({
      id: v.id,
      client_id: v.client_id,
      client_name: v.clients?.name || 'Unknown',
      client_branch: v.clients?.branch || null,
      tech_name: v.tech_name || 'Unknown',
      tech_phone: v.tech_phone,
      work_type: v.work_type || 'maintenance',
      notes: v.notes || '',
      parts_used: v.parts_used,
      hours_spent: v.hours_spent,
      photo_url: v.photo_url,
      signature_data: v.signature_data,
      completed_date: v.completed_date,
      gps_latitude: v.gps_latitude,
      gps_longitude: v.gps_longitude,
      photos_count: countMap[v.id] || 0,
    }));

    setReports(mapped);
    setLoading(false);
  };

  const filtered = reports.filter((r) => {
    if (search && !r.client_name.toLowerCase().includes(search.toLowerCase()) &&
        !r.tech_name.toLowerCase().includes(search.toLowerCase()) &&
        !(r.client_branch || '').toLowerCase().includes(search.toLowerCase())) return false;
    if (workTypeFilter && r.work_type !== workTypeFilter) return false;
    return true;
  });

  const workTypeColor = (type: string) => {
    switch (type) {
      case 'repair': return 'bg-red-500/20 text-red-400';
      case 'maintenance': return 'bg-indigo-500/20 text-indigo-400';
      case 'inspection': return 'bg-amber-500/20 text-amber-400';
      case 'installation': return 'bg-emerald-500/20 text-emerald-400';
      default: return 'bg-gray-500/20 text-gray-400';
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Field Reports</h1>
          <p className="text-gray-400 text-sm mt-1">QR check-ins from field technicians</p>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Check-ins', value: reports.length, color: 'text-indigo-400' },
          { label: 'This Month', value: reports.filter(r => new Date(r.completed_date).getMonth() === new Date().getMonth()).length, color: 'text-emerald-400' },
          { label: 'Repairs', value: reports.filter(r => r.work_type === 'repair').length, color: 'text-red-400' },
          { label: 'Maintenance', value: reports.filter(r => r.work_type === 'maintenance').length, color: 'text-amber-400' },
        ].map((stat) => (
          <div key={stat.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-xs text-gray-500">{stat.label}</p>
            <p className={`text-2xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by branch or technician..."
            className="w-full bg-gray-900 border border-gray-800 rounded-xl pl-10 pr-4 py-2.5 text-white text-sm placeholder-gray-600 focus:border-indigo-500 focus:outline-none"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {['maintenance', 'repair', 'inspection', 'installation'].map((wt) => (
            <button key={wt}
              onClick={() => setWorkTypeFilter(workTypeFilter === wt ? null : wt)}
              className={`px-3 py-2 rounded-lg text-xs font-medium capitalize transition border ${
                workTypeFilter === wt
                  ? 'bg-indigo-600 border-indigo-500 text-white'
                  : 'bg-gray-900 border-gray-800 text-gray-400 hover:text-white'
              }`}
            >{wt}</button>
          ))}
          {workTypeFilter && (
            <button onClick={() => setWorkTypeFilter(null)}
              className="px-2 py-2 text-gray-500 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Reports table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <QrCode className="w-12 h-12 text-gray-700 mx-auto mb-3" />
            <p className="text-gray-500">No field reports yet</p>
            <p className="text-gray-600 text-sm mt-1">Reports appear here when technicians check in via QR code</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-left text-gray-500 text-xs uppercase tracking-wider">
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Branch</th>
                  <th className="px-4 py-3">Technician</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Work Done</th>
                  <th className="px-4 py-3">Parts</th>
                  <th className="px-4 py-3">Hours</th>
                  <th className="px-4 py-3">Photo</th>
                  <th className="px-4 py-3">Signature</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id}
                    onClick={() => setSelectedReport(selectedReport?.id === r.id ? null : r)}
                    className={`border-b border-gray-800/50 hover:bg-gray-800/50 cursor-pointer transition ${
                      selectedReport?.id === r.id ? 'bg-gray-800/30' : ''
                    }`}
                  >
                    <td className="px-4 py-3 text-gray-300 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-3.5 h-3.5 text-gray-500" />
                        {new Date(r.completed_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-white font-medium">{r.client_name}</p>
                      {r.client_branch && <p className="text-xs text-gray-500">{r.client_branch}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <User className="w-3.5 h-3.5 text-gray-500" />
                        <span className="text-gray-300">{r.tech_name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium capitalize ${workTypeColor(r.work_type)}`}>
                        {r.work_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 max-w-xs truncate">
                      {r.notes}
                    </td>
                    <td className="px-4 py-3 text-gray-400 max-w-[120px] truncate">
                      {r.parts_used || '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-400">
                      {r.hours_spent ? `${r.hours_spent}h` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {r.photo_url ? (
                        <img src={r.photo_url} alt="" className="w-10 h-10 rounded-lg object-cover border border-gray-700" />
                      ) : (
                        <span className="text-gray-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {r.signature_data ? (
                        <img src={r.signature_data} alt="Signature" className="h-8 max-w-[80px] object-contain opacity-60" />
                      ) : (
                        <span className="text-gray-600">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Expanded row detail */}
      {selectedReport && (
        <div className="mt-2 bg-gray-900 border border-gray-800 rounded-xl p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-white font-semibold mb-3">Work Details</h3>
              <div className="space-y-3 text-sm">
                <div>
                  <p className="text-gray-500">Description</p>
                  <p className="text-gray-300">{selectedReport.notes}</p>
                </div>
                {selectedReport.parts_used && (
                  <div>
                    <p className="text-gray-500">Parts Used</p>
                    <p className="text-gray-300">{selectedReport.parts_used}</p>
                  </div>
                )}
                {selectedReport.hours_spent && (
                  <div>
                    <p className="text-gray-500">Hours Spent</p>
                    <p className="text-gray-300">{selectedReport.hours_spent}h</p>
                  </div>
                )}
                {(selectedReport.gps_latitude && selectedReport.gps_longitude) && (
                  <div>
                    <p className="text-gray-500">Location</p>
                    <p className="text-gray-300 text-xs font-mono">
                      {selectedReport.gps_latitude.toFixed(6)}, {selectedReport.gps_longitude.toFixed(6)}
                    </p>
                  </div>
                )}
              </div>
            </div>
            <div>
              <h3 className="text-white font-semibold mb-3">Attachments</h3>
              <div className="space-y-3">
                {selectedReport.photo_url && (
                  <div>
                    <p className="text-gray-500 text-sm mb-1">Work Photo ({selectedReport.photos_count} total)</p>
                    <a href={selectedReport.photo_url} target="_blank" rel="noopener noreferrer">
                      <img src={selectedReport.photo_url} alt="Work photo"
                        className="w-full max-w-sm rounded-xl border border-gray-700 object-cover" />
                    </a>
                  </div>
                )}
                {selectedReport.signature_data && (
                  <div>
                    <p className="text-gray-500 text-sm mb-1">Signature</p>
                    <img src={selectedReport.signature_data} alt="Signature"
                      className="h-16 rounded-lg border border-gray-700 bg-white" />
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-gray-800 flex gap-3">
            <button onClick={() => navigate(`/clients/${selectedReport.client_id}`)}
              className="text-sm text-indigo-400 hover:text-indigo-300 transition">
              View Client →
            </button>
            <button onClick={() => setSelectedReport(null)}
              className="text-sm text-gray-500 hover:text-gray-400 transition">
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
