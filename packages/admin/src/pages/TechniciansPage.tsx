import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { UserCog } from 'lucide-react';

interface Profile { id: string; full_name: string; email: string; role: string; }

export function TechniciansPage() {
  const [technicians, setTechnicians] = useState<Profile[]>([]);

  useEffect(() => {
    supabase.from('profiles').select('*').eq('role', 'technician').then(({ data }) => setTechnicians(data || []));
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-1">Technicians</h1>
      <p className="text-gray-400 mb-6">{technicians.length} field technicians</p>
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="text-left p-4 text-sm text-gray-400">Name</th>
              <th className="text-left p-4 text-sm text-gray-400">Email</th>
              <th className="text-left p-4 text-sm text-gray-400">Role</th>
            </tr>
          </thead>
          <tbody>
            {technicians.map((t) => (
              <tr key={t.id} className="border-b border-gray-800/50">
                <td className="p-4 text-white font-medium">{t.full_name}</td>
                <td className="p-4 text-gray-300">{t.email}</td>
                <td className="p-4"><span className="text-xs px-2 py-1 bg-indigo-500/20 text-indigo-400 rounded-full capitalize">{t.role}</span></td>
              </tr>
            ))}
            {technicians.length === 0 && (
              <tr><td colSpan={3} className="p-8 text-center text-gray-500">No technicians registered</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
