/// <reference types="vite/client" />
import type { CoupleWidgetApi } from '../shared/types'

declare global {
  interface Window {
    /** Secure bridge exposed by the preload script. */
    couple: CoupleWidgetApi
  }
}

export {}
