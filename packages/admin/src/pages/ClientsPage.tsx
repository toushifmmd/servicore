import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Edit, Trash2, Phone, MapPin, Building2 } from 'lucide-react';

interface Client {
  id: string;
  name: string;
  company_name: string | null;
  phone: string;
  address: string | null;
  branch: string | null;
  service_frequency_months: number;
  created_at: string;
}

export function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const navigate = useNavigate();

  // Form state
  const [form, setForm] = useState({
    name: '', company_name: '', phone: '', address: '',
    branch: '', service_frequency_months: 6
  });

  const loadClients = async () => {
    let q = supabase.from('clients').select('*').order('created_at', { ascending: false });
    if (search) q = q.ilike('name', `%${search}%`);
    const { data } = await q;
    setClients(data || []);
  };

  useEffect(() => { loadClients(); }, [search]);

  const openAdd = () => {
    setEditing(null);
    setForm({ name: '', company_name: '', phone: '', address: '', branch: '', service_frequency_months: 6 });
    setShowModal(true);
  };

  const openEdit = (c: Client) => {
    setEditing(c);
    setForm({
      name: c.name, company_name: c.company_name || '', phone: c.phone,
      address: c.address || '', branch: c.branch || '', service_frequency_months: c.service_frequency_months
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editing) {
      await supabase.from('clients').update(form).eq('id', editing.id);
    } else {
      await supabase.from('clients').insert([form]);
    }
    setShowModal(false);
    loadClients();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this client and all associated data?')) return;
    await supabase.from('clients').delete().eq('id', id);
    loadClients();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Clients</h1>
          <p className="text-gray-400">{clients.length} total</p>
        </div>
        <button onClick={openAdd} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg font-medium transition">
          <Plus className="w-4 h-4" /> Add Client
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input
          type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or phone..."
          className="w-full bg-gray-900 border border-gray-800 rounded-lg pl-10 pr-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
        />
      </div>

      {/* Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="text-left p-4 text-sm font-medium text-gray-400">Name</th>
              <th className="text-left p-4 text-sm font-medium text-gray-400">Company</th>
              <th className="text-left p-4 text-sm font-medium text-gray-400">Phone</th>
              <th className="text-left p-4 text-sm font-medium text-gray-400">Branch</th>
              <th className="text-left p-4 text-sm font-medium text-gray-400">Frequency</th>
              <th className="text-right p-4 text-sm font-medium text-gray-400">Actions</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => (
              <tr key={c.id} className="border-b border-gray-800/50 hover:bg-gray-800/50 transition cursor-pointer"
                onClick={() => navigate(`/clients/${c.id}`)}>
                <td className="p-4 text-white font-medium">{c.name}</td>
                <td className="p-4 text-gray-300">{c.company_name || '—'}</td>
                <td className="p-4 text-gray-300">{c.phone}</td>
                <td className="p-4 text-gray-300">{c.branch || '—'}</td>
                <td className="p-4 text-gray-300">Every {c.service_frequency_months} months</td>
                <td className="p-4 text-right" onClick={(e) => e.stopPropagation()}>
                  <div className="flex justify-end gap-2">
                    <button onClick={() => openEdit(c)} className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition">
                      <Edit className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDelete(c.id)} className="p-2 text-gray-400 hover:text-red-400 hover:bg-gray-700 rounded-lg transition">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {clients.length === 0 && (
              <tr><td colSpan={6} className="p-8 text-center text-gray-500">No clients found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowModal(false)}>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-white mb-4">{editing ? 'Edit Client' : 'Add Client'}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Name *</label>
                <input type="text" required value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white" />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Company / Bank Name</label>
                <input type="text" value={form.company_name}
                  onChange={(e) => setForm({ ...form, company_name: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white" />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Phone *</label>
                <input type="text" required value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white" />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Address</label>
                <input type="text" value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Branch</label>
                  <input type="text" value={form.branch}
                    onChange={(e) => setForm({ ...form, branch: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white" />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Service (months)</label>
                  <input type="number" min={1} max={24} value={form.service_frequency_months}
                    onChange={(e) => setForm({ ...form, service_frequency_months: Number(e.target.value) })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white" />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white py-2 rounded-lg font-medium transition">
                  {editing ? 'Update' : 'Create'}
                </button>
                <button type="button" onClick={() => setShowModal(false)}
                  className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 py-2 rounded-lg font-medium transition">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
