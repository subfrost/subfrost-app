import React from 'react'
import './styles/index.css'
import './styles/ionicons.css';
import Home from './ui/views/Home'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { createRoot } from 'react-dom/client'
import { Footer, Header } from './ui/base'

createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
      <Header />
      <main>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Home />} />
          </Routes>
        </BrowserRouter>
      </main>
      <Footer />
  </React.StrictMode>
)
