import { useState, useRef } from 'react'
import './App.css'
import { Auth } from './components/Auth.jsx'
import Cookies from 'universal-cookie'
import { Chat } from './components/Chat.jsx'
import { signOut } from 'firebase/auth'
import { auth } from './firebase-config.js'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import DebugEncrypted from './pages/DebugEncrypted.jsx'

function Home() {
  const cookies = new Cookies()
  const [isAuth, setIsAuth] = useState(cookies.get("auth-token"))
  const [room, setRoom] = useState("")
  const [roomPassword, setRoomPassword] = useState("")
  const roomInputRef = useRef(null)

  const handleSignOut = async () => {
    try {
      await signOut(auth)
      cookies.remove("auth-token")
      setIsAuth(false)
      setRoom("")
      setRoomPassword("")
    } catch (error) {
      console.error("Sign out error:", error)
    }
  }

  if (!isAuth) {
    return (
      <div className="App bg-gray-50">
        <Auth setIsAuth={setIsAuth} />
      </div>
    )
  }

  return (
    <div className="App bg-gray-50 flex items-center justify-center p-4">
      {room ? (
        <div className="w-full max-w-4xl h-[90vh] bg-white rounded-2xl shadow-xl overflow-hidden flex flex-col">
          <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shadow-sm z-10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-bold text-lg">
                {room.charAt(0).toUpperCase()}
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-800">{room}</h1>
                <p className="text-xs text-gray-500 font-medium">End-to-End Encrypted</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button 
                onClick={() => { setRoom(""); setRoomPassword(""); }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Leave
              </button>
              <button 
                onClick={handleSignOut}
                className="px-4 py-2 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors shadow-sm"
              >
                Sign Out
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-hidden relative bg-gray-50">
            <Chat room={room} roomPassword={roomPassword} />
          </div>
        </div>
      ) : (
        <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-indigo-600 rounded-2xl mx-auto mb-4 flex items-center justify-center shadow-lg shadow-indigo-200">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path>
              </svg>
            </div>
            <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Join Secure Chat</h1>
            <p className="text-gray-500 mt-2 text-sm">Enter a room name and optional password to start chatting securely.</p>
          </div>
          
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">Room Name</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
                  </svg>
                </div>
                <input 
                  ref={roomInputRef} 
                  placeholder="e.g. secret-meeting"
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow shadow-sm bg-gray-50 focus:bg-white"
                  onKeyDown={(e) => e.key === 'Enter' && setRoom(roomInputRef.current.value)}
                />
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">Encryption Password</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <input
                  type="password"
                  onChange={(e) => setRoomPassword(e.target.value)}
                  value={roomPassword}
                  placeholder="Optional (but recommended)"
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow shadow-sm bg-gray-50 focus:bg-white"
                  onKeyDown={(e) => e.key === 'Enter' && setRoom(roomInputRef.current.value)}
                />
              </div>
            </div>
            
            <button 
              onClick={() => setRoom(roomInputRef.current.value)}
              className="w-full mt-6 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-xl transition-colors shadow-md shadow-indigo-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
            >
              Enter Room
            </button>
            
            <div className="pt-6 mt-6 border-t border-gray-100">
              <button 
                onClick={handleSignOut}
                className="w-full bg-white hover:bg-gray-50 text-gray-700 font-semibold py-3 px-4 border border-gray-200 rounded-xl transition-colors shadow-sm"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/debug/encrypted" element={<DebugEncrypted />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App