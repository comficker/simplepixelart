import {useFetch, type UseFetchOptions} from '#app'
import {defu} from 'defu'
import {unref} from 'vue'
import useStatefulCookie from "~/composables/useStatefulCookie";

function getParams<T>(url: string, options: any = {}) {
  const config = useRuntimeConfig()
  const _headers = useRequestHeaders(['cookie'])
  const authToken = useStatefulCookie('auth_token')
  const headers: any = {
    "Content-Type": 'application/json',
    "Accept": 'application/json; indent=2',
    ..._headers
  }
  if (authToken.value) {
    headers['Authorization'] = `Bearer ${authToken.value}`
  }
  // Tag titles come back localised when the backend has a translation for the
  // locale (apps/coloring TaxonomySerializer). Without this header every
  // language reads the English tag.
  // useNativeFetch is also called from store actions that have resumed after
  // an await, where there is no Nuxt instance to read -- fall back to no
  // header there rather than throwing on every imperative request.
  let locale = ''
  try {
    locale = unref(useNuxtApp().$i18n?.locale) || ''
  } catch {
    locale = ''
  }
  if (locale) {
    headers['Accept-Language'] = locale
  }

  const q = options?.query ?? options?.params
  const qVal = q ? unref(q) : undefined
  // The locale belongs in the key: the same URL now returns different tag
  // titles per language, and without it a switch would replay the cached
  // payload of the language before it.
  const base = locale ? `${locale}:${url}` : url
  const defaultKey = qVal ? `${base}?${JSON.stringify(qVal)}` : base
  const defaults: UseFetchOptions<T> = {
    baseURL: <string>config.public.api,
    key: defaultKey,
    headers: headers,
    query: options?.query
  }
  return defu(options, defaults)
}

export function useNativeFetch<T>(url: string, options: any = undefined): Promise<T> {
  return $fetch(url, getParams(url, options))
}

export function useAuthFetch<T>(url: string, options: UseFetchOptions<T> = {}) {
  return useFetch<T>(url, getParams(url, options))
}
