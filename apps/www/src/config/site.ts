export const siteConfig = {
  name: 'M-Box Generator',
  url: import.meta.env.VITE_SITE_URL || 'http://localhost:3000',
  ogImage:
    'https://og-image-craigary.vercel.app/**M-Box%20Generator**.png?theme=light&md=1&fontSize=100px',
  description: 'Browser-based 3D printable storage box generator with STL and 3MF model fitting.',
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
