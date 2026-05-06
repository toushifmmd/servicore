import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Bell, Check, Clock, AlertCircle } from 'lucide-react';

interface Reminder {
  id: string; client_id: string; scheduled_date: string; status: string;
  whatsapp_sent: boolean; clients: { name: string; phone: string };
}

export function RemindersPage() {
  const [reminders, setReminders] = useState<Reminder[]>([]);

  useEffect(() => {
    supabase.from('reminders')
      .select('*, clients(name, phone)')
      .order('scheduled_date', { ascending: true })
      .limit(100)
      .then(({ data }) => setReminders(data || []));
  }, []);

  const statusIcon = (s: string) => {
    switch (s) {
      case 'sent': return <Check className="w-4 h-4 text-emerald-400" />;
      case 'pending': return <Clock className="w-4 h-4 text-amber-400" />;
      case 'failed': return <AlertCircle className="w-4 h-4 text-red-400" />;
      default: return <Bell className="w-4 h-4 text-gray-400" />;
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Reminders</h1>
          <p className="text-gray-400">{reminders.length} scheduled</p>
        </div>
      </div>
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="text-left p-4 text-sm text-gray-400">Client</th>
              <th className="text-left p-4 text-sm text-gray-400">Phone</th>
              <th className="text-left p-4 text-sm text-gray-400">Scheduled</th>
              <th className="text-left p-4 text-sm text-gray-400">Status</th>
              <th className="text-left p-4 text-sm text-gray-400">WhatsApp</th>
            </tr>
          </thead>
          <tbody>
            {reminders.map((r) => (
              <tr key={r.id} className="border-b border-gray-800/50 hover:bg-gray-800/50">
                <td className="p-4 text-white font-medium">{r.clients?.name || 'Unknown'}</td>
                <td className="p-4 text-gray-300">{r.clients?.phone || '—'}</td>
                <td className="p-4 text-gray-300">{new Date(r.scheduled_date).toLocaleDateString('en-IN')}</td>
                <td className="p-4 flex items-center gap-2">
                  {statusIcon(r.status)}
                  <span className="text-sm capitalize">{r.status}</span>
                </td>
                <td className="p-4">
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${r.whatsapp_sent ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-800 text-gray-500'}`}>
                    {r.whatsapp_sent ? 'Sent' : 'Pending'}
                  </span>
                </td>
              </tr>
            ))}
            {reminders.length === 0 && (
              <tr><td colSpan={5} className="p-8 text-center text-gray-500">No reminders</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
