import {useFetch, type UseFetchOptions} from '#app'
import {defu} from 'defu'
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
  const defaults: UseFetchOptions<T> = {
    baseURL: <string>config.public.api,
    key: url,
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
