import { createContext, useContext } from 'react'

interface AuthContextType {
  logout: () => void
}

export const AuthContext = createContext<AuthContextType>({ logout: () => {} })

export const useAuth = () => useContext(AuthContext)
