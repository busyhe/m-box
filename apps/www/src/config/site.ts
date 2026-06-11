export const siteConfig = {
  name: 'TanStack Starter',
  url: import.meta.env.VITE_SITE_URL || 'http://localhost:3000',
  ogImage:
    'https://og-image-craigary.vercel.app/**TanStack%20Starter**.png?theme=dark&md=1&fontSize=100px&images=https%3A%2F%2Fnobelium.vercel.app%2Flogo-for-dark-bg.svg',
  description: 'A starter template for TanStack Start with Shadcn UI and Tailwind CSS',
  links: {
    homepage: 'https://busyhe.com',
    twitter: 'https://twitter.com/busyhe_',
    github: 'https://github.com/busyhe',
  },
}

export type SiteConfig = typeof siteConfig

export const META_THEME_COLORS = {
  light: '#ffffff',
  dark: '#09090b',
}
