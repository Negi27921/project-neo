import axios from 'axios'

// In production (Vercel), VITE_API_URL points to the deployed backend.
// In dev, the Vite proxy forwards /api → localhost:8000.
const BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api'

const client = axios.create({
  baseURL: BASE,
  timeout: 15000,
})

export default client
