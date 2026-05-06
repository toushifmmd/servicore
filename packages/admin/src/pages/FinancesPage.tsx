import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, TrendingUp, TrendingDown, Download } from 'lucide-react';

interface Transaction {
  id: string; type: 'income' | 'expense'; amount: number; category: string;
  description: string | null; transaction_date: string; payment_method: string;
  clients: { name: string } | null;
}

interface Summary { income: number; expense: number; }

export function FinancesPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [summary, setSummary] = useState<Summary>({ income: 0, expense: 0 });
  const [showModal, setShowModal] = useState(false);
  const [tab, setTab] = useState<'transactions' | 'reports'>('transactions');

  const [form, setForm] = useState({
    type: 'income' as 'income' | 'expense',
    amount: '', category: '', description: '',
    payment_method: 'cash', client_id: '', transaction_date: new Date().toISOString().split('T')[0]
  });

  const load = async () => {
    const { data } = await supabase.from('financial_transactions')
      .select('*, clients(name)')
      .order('transaction_date', { ascending: false }).limit(100);
    setTransactions(data || []);

    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const { data: monthData } = await supabase.from('financial_transactions')
      .select('amount, type').gte('transaction_date', start);
    const txs = monthData || [];
    setSummary({
      income: txs.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0),
      expense: txs.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0)
    });
  };

  useEffect(() => { load(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await supabase.from('financial_transactions').insert([{
      ...form, amount: Number(form.amount),
      client_id: form.client_id || null
    }]);
    setShowModal(false);
    setForm({ type: 'income', amount: '', category: '', description: '', payment_method: 'cash', client_id: '', transaction_date: new Date().toISOString().split('T')[0] });
    load();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Finances</h1>
          <p className="text-gray-400">Track income & expenses</p>
        </div>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg font-medium transition">
          <Plus className="w-4 h-4" /> Add Transaction
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="flex items-center gap-2 text-emerald-400 mb-1"><TrendingUp className="w-4 h-4" /> <span className="text-sm">Income (MTD)</span></div>
          <p className="text-xl font-bold text-white">₹{summary.income.toLocaleString('en-IN')}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="flex items-center gap-2 text-red-400 mb-1"><TrendingDown className="w-4 h-4" /> <span className="text-sm">Expenses (MTD)</span></div>
          <p className="text-xl font-bold text-white">₹{summary.expense.toLocaleString('en-IN')}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="flex items-center gap-2 text-indigo-400 mb-1"><Download className="w-4 h-4" /> <span className="text-sm">Profit/Loss</span></div>
          <p className={`text-xl font-bold ${summary.income - summary.expense >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            ₹{(summary.income - summary.expense).toLocaleString('en-IN')}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        {(['transactions', 'reports'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition ${
              tab === t ? 'bg-indigo-600 text-white' : 'bg-gray-900 text-gray-400 hover:text-white'
            }`}>{t}</button>
        ))}
      </div>

      {/* Transactions Table */}
      {tab === 'transactions' && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left p-4 text-sm text-gray-400">Date</th>
                <th className="text-left p-4 text-sm text-gray-400">Category</th>
                <th className="text-left p-4 text-sm text-gray-400">Description</th>
                <th className="text-left p-4 text-sm text-gray-400">Client</th>
                <th className="text-left p-4 text-sm text-gray-400">Payment</th>
                <th className="text-right p-4 text-sm text-gray-400">Amount</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => (
                <tr key={t.id} className="border-b border-gray-800/50 hover:bg-gray-800/50">
                  <td className="p-4 text-gray-300 text-sm">{new Date(t.transaction_date).toLocaleDateString('en-IN')}</td>
                  <td className="p-4">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                      t.type === 'income' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                    }`}>{t.category || t.type}</span>
                  </td>
                  <td className="p-4 text-gray-300">{t.description || '—'}</td>
                  <td className="p-4 text-gray-300">{t.clients?.name || '—'}</td>
                  <td className="p-4 text-gray-400 text-sm capitalize">{t.payment_method}</td>
                  <td className={`p-4 text-right font-medium ${t.type === 'income' ? 'text-emerald-400' : 'text-red-400'}`}>
                    {t.type === 'income' ? '+' : '-'}₹{Number(t.amount).toLocaleString('en-IN')}
                  </td>
                </tr>
              ))}
              {transactions.length === 0 && (
                <tr><td colSpan={6} className="p-8 text-center text-gray-500">No transactions yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Reports Tab */}
      {tab === 'reports' && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Monthly Summary</h3>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <p className="text-sm text-gray-400 mb-2">Income Breakdown</p>
              <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${summary.income > 0 ? 100 : 0}%` }} />
              </div>
              <p className="text-emerald-400 mt-2 font-medium">₹{summary.income.toLocaleString('en-IN')}</p>
            </div>
            <div>
              <p className="text-sm text-gray-400 mb-2">Expense Breakdown</p>
              <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                <div className="h-full bg-red-500 rounded-full" style={{ width: `${summary.expense > 0 ? Math.min((summary.expense / Math.max(summary.income, 1)) * 100, 100) : 0}%` }} />
              </div>
              <p className="text-red-400 mt-2 font-medium">₹{summary.expense.toLocaleString('en-IN')}</p>
            </div>
          </div>
        </div>
      )}

      {/* Add Transaction Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowModal(false)}>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-white mb-4">Add Transaction</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex gap-2">
                <button type="button" onClick={() => setForm({ ...form, type: 'income' })}
                  className={`flex-1 py-2 rounded-lg font-medium transition ${form.type === 'income' ? 'bg-emerald-600 text-white' : 'bg-gray-800 text-gray-400'}`}>Income</button>
                <button type="button" onClick={() => setForm({ ...form, type: 'expense' })}
                  className={`flex-1 py-2 rounded-lg font-medium transition ${form.type === 'expense' ? 'bg-red-600 text-white' : 'bg-gray-800 text-gray-400'}`}>Expense</button>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Amount *</label>
                <input type="number" required value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white" />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Category</label>
                <input type="text" value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  placeholder="e.g. Service Fee, Parts, Travel"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white" />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Description</label>
                <input type="text" value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Payment Method</label>
                  <select value={form.payment_method}
                    onChange={(e) => setForm({ ...form, payment_method: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white">
                    <option value="cash">Cash</option>
                    <option value="upi">UPI</option>
                    <option value="bank">Bank Transfer</option>
                    <option value="cheque">Cheque</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Date</label>
                  <input type="date" value={form.transaction_date}
                    onChange={(e) => setForm({ ...form, transaction_date: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white" />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white py-2 rounded-lg font-medium transition">Save</button>
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
