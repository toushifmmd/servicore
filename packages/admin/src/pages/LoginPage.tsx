import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { useNavigate } from 'react-router-dom';
import { LogIn, Wrench } from 'lucide-react';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { signIn, user } = useAuth();
  const navigate = useNavigate();

  if (user) {
    navigate('/', { replace: true });
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const { error } = await signIn(email, password);
    if (error) setError(error);
    else navigate('/', { replace: true });
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-indigo-500 to-cyan-500 rounded-2xl mb-4">
            <Wrench className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white">ServiCore</h1>
          <p className="text-gray-400 mt-2">Hardware Service Management</p>
        </div>
        <form onSubmit={handleSubmit} className="bg-gray-900 rounded-xl p-6 border border-gray-800">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg p-3 mb-4 text-sm">
              {error}
            </div>
          )}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-300 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
              placeholder="admin@example.com"
              required
            />
          </div>
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-300 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
              placeholder="••••••••"
              required
            />
          </div>
          <button
            type="submit"
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-2.5 rounded-lg flex items-center justify-center gap-2 transition"
          >
            <LogIn className="w-4 h-4" />
            Sign In
          </button>
        </form>
      </div>
    </div>
  );
}
