import React from 'react'
import './styles/index.css'
import './styles/ionicons.css'
import Home from './ui/views/Home'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { createRoot } from 'react-dom/client'
import { Footer } from './ui/base/footer'
import { Header } from './ui/base/header'

createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <Header />
    <main className="font-">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
        </Routes>
      </BrowserRouter>
    </main>
    <Footer />
  </React.StrictMode>
)
