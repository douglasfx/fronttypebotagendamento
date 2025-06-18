import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL // Para Create React App
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY // Para Create React App

export const supabase = createClient(supabaseUrl, supabaseAnonKey)