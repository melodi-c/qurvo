import { Nav } from '@/components/Nav'
import { Hero } from '@/components/Hero'
import { LogoBar } from '@/components/LogoBar'
import { Features } from '@/components/Features'
import { HowItWorks } from '@/components/HowItWorks'
import { Pricing } from '@/components/Pricing'
import { Faq } from '@/components/Faq'
import { Footer } from '@/components/Footer'

const APP_URL = 'https://app.qurvo.ru'

export default function App() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Nav appUrl={APP_URL} />
      <main>
        <Hero appUrl={APP_URL} />
        <LogoBar />
        <Features />
        <HowItWorks />
        <Pricing appUrl={APP_URL} />
        <Faq />
      </main>
      <Footer appUrl={APP_URL} />
    </div>
  )
}
