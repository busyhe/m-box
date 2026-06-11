import logoImage from '@/assets/images/logo.jpg'

export function Logo({ className }: { className?: string }) {
  return <img src={logoImage} alt="Logo" width={24} height={24} className={className} />
}
