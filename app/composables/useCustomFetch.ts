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
  // useFetch is wrapped in a single call site, so its automatic per-call-site
  // key can't distinguish calls. Derive a key from url + params so two fetches
  // to the SAME url with DIFFERENT params don't collide on one cache entry
  // (which made distinct sections render identical data). Callers can still
  // pass an explicit `key` (it wins via defu).
  const q = options?.query ?? options?.params
  const qVal = q ? unref(q) : undefined
  const defaultKey = qVal ? `${url}?${JSON.stringify(qVal)}` : url
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
