import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, Search, Edit, Trash2, Wrench, Calendar, Shield } from 'lucide-react';

interface Equipment {
  id: string;
  client_id: string;
  type: string;
  make: string | null;
  model: string | null;
  serial_number: string | null;
  purchase_date: string | null;
  warranty_expiry: string | null;
  notes: string | null;
  clients: { name: string } | null;
}

export function EquipmentPage() {
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Equipment | null>(null);

  const [form, setForm] = useState({
    client_id: '', type: 'Camera', make: '', model: '',
    serial_number: '', purchase_date: '', warranty_expiry: '', notes: ''
  });

  const loadEquipment = async () => {
    let q = supabase.from('equipment')
      .select('*, clients(name)')
      .order('created_at', { ascending: false });
    if (search) q = q.or(`type.ilike.%${search}%,make.ilike.%${search}%,model.ilike.%${search}%`);
    const { data } = await q;
    setEquipment(data || []);
  };

  useEffect(() => { loadEquipment(); }, [search]);

  const openAdd = () => {
    setEditing(null);
    setForm({ client_id: '', type: 'Camera', make: '', model: '', serial_number: '', purchase_date: '', warranty_expiry: '', notes: '' });
    setShowModal(true);
  };

  const openEdit = (e: Equipment) => {
    setEditing(e);
    setForm({
      client_id: e.client_id, type: e.type, make: e.make || '', model: e.model || '',
      serial_number: e.serial_number || '', purchase_date: e.purchase_date || '',
      warranty_expiry: e.warranty_expiry || '', notes: e.notes || ''
    });
    setShowModal(true);
  };

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (editing) {
      await supabase.from('equipment').update(form).eq('id', editing.id);
    } else {
      await supabase.from('equipment').insert([form]);
    }
    setShowModal(false);
    loadEquipment();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this equipment record?')) return;
    await supabase.from('equipment').delete().eq('id', id);
    loadEquipment();
  };

  const warrantyBadge = (expiry: string | null) => {
    if (!expiry) return null;
    const now = new Date();
    const exp = new Date(expiry);
    const days = Math.ceil((exp.getTime() - now.getTime()) / 86400000);
    if (days < 0) return <span className="text-xs px-2 py-0.5 bg-red-500/20 text-red-400 rounded-full">Expired</span>;
    if (days < 30) return <span className="text-xs px-2 py-0.5 bg-amber-500/20 text-amber-400 rounded-full">{days}d left</span>;
    return <span className="text-xs px-2 py-0.5 bg-emerald-500/20 text-emerald-400 rounded-full">Active</span>;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Equipment</h1>
          <p className="text-gray-400">{equipment.length} items</p>
        </div>
        <button onClick={openAdd} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg font-medium transition">
          <Plus className="w-4 h-4" /> Add Equipment
        </button>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input
          type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by type, make, or model..."
          className="w-full bg-gray-900 border border-gray-800 rounded-lg pl-10 pr-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
        />
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="text-left p-4 text-sm text-gray-400">Type</th>
              <th className="text-left p-4 text-sm text-gray-400">Make / Model</th>
              <th className="text-left p-4 text-sm text-gray-400">Serial</th>
              <th className="text-left p-4 text-sm text-gray-400">Client</th>
              <th className="text-left p-4 text-sm text-gray-400">Warranty</th>
              <th className="text-right p-4 text-sm text-gray-400">Actions</th>
            </tr>
          </thead>
          <tbody>
            {equipment.map((e) => (
              <tr key={e.id} className="border-b border-gray-800/50 hover:bg-gray-800/50">
                <td className="p-4 text-white font-medium">{e.type}</td>
                <td className="p-4 text-gray-300">{[e.make, e.model].filter(Boolean).join(' ') || '—'}</td>
                <td className="p-4 text-gray-400 font-mono text-sm">{e.serial_number || '—'}</td>
                <td className="p-4 text-gray-300">{e.clients?.name || '—'}</td>
                <td className="p-4">{warrantyBadge(e.warranty_expiry)}</td>
                <td className="p-4 text-right">
                  <div className="flex justify-end gap-2">
                    <button onClick={() => openEdit(e)} className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition">
                      <Edit className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDelete(e.id)} className="p-2 text-gray-400 hover:text-red-400 hover:bg-gray-700 rounded-lg transition">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {equipment.length === 0 && (
              <tr><td colSpan={6} className="p-8 text-center text-gray-500">No equipment found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowModal(false)}>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-white mb-4">{editing ? 'Edit Equipment' : 'Add Equipment'}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Type *</label>
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white">
                  <option value="Camera">Camera</option>
                  <option value="DVR/NVR">DVR/NVR</option>
                  <option value="UPS">UPS</option>
                  <option value="Battery">Battery</option>
                  <option value="Cable/Network">Cable/Network</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Make</label>
                  <input type="text" value={form.make}
                    onChange={(e) => setForm({ ...form, make: e.target.value })}
                    placeholder="e.g. Hikvision, APC"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white" />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Model</label>
                  <input type="text" value={form.model}
                    onChange={(e) => setForm({ ...form, model: e.target.value })}
                    placeholder="e.g. DS-2CD1021-I"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white" />
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Serial Number</label>
                <input type="text" value={form.serial_number}
                  onChange={(e) => setForm({ ...form, serial_number: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white font-mono" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Purchase Date</label>
                  <input type="date" value={form.purchase_date}
                    onChange={(e) => setForm({ ...form, purchase_date: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white" />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Warranty Expiry</label>
                  <input type="date" value={form.warranty_expiry}
                    onChange={(e) => setForm({ ...form, warranty_expiry: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white" />
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Notes</label>
                <textarea value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={2}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white resize-none" />
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
