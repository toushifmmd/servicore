import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://gtllsbnwqvvftikvleuz.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0bGxzYm53cXZ2ZnRpa3ZsZXV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5OTI2MDcsImV4cCI6MjA5MzU2ODYwN30.AHCXPwXfjxvalUqyz2VtK3ihjnqxCIJQj-uZIqLi_V8';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: {
      getItem: (key) => Promise.resolve(null),
      setItem: (key, value) => Promise.resolve(),
      removeItem: (key) => Promise.resolve(),
    },
  },
});
