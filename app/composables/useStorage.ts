import { ref, watch, type Ref } from 'vue'

export interface UseStorageOptions<T> {
  defaultValue?: T
  serializer?: {
    read: (value: string) => T
    write: (value: T) => string
  }
  onError?: (error: Error) => void
}

export function useStorage<T>(
  key: string,
  storage: 'localStorage' | 'sessionStorage' = 'localStorage',
  options: UseStorageOptions<T> = {}
) {
  const {
    defaultValue,
    serializer = {
      read: (value: string) => {
        try {
          return JSON.parse(value) as T
        } catch {
          return value as T
        }
      },
      write: (value: T) => JSON.stringify(value)
    },
    onError = (error) => console.error(`useStorage error for key "${key}":`, error)
  } = options

  const storageRef = globalThis[storage]
  
  // @ts-ignore
  const storedValue = ref<T | undefined>(() => {
    try {
      const rawValue = storageRef.getItem(key)
      if (rawValue === null) {
        return defaultValue
      }
      return serializer.read(rawValue)
    } catch (error) {
      onError(error as Error)
      return defaultValue
    }
  }) as Ref<T>

  watch(
    storedValue,
    (newValue) => {
      try {
        if (newValue === undefined || newValue === null) {
          storageRef.removeItem(key)
        } else {
          storageRef.setItem(key, serializer.write(newValue))
        }
      } catch (error) {
        onError(error as Error)
      }
    },
    { deep: true }
  )

  const remove = () => {
    try {
      storageRef.removeItem(key)
      storedValue.value = defaultValue as T
    } catch (error) {
      onError(error as Error)
    }
  }

  const clear = () => {
    try {
      storageRef.clear()
      storedValue.value = defaultValue as T
    } catch (error) {
      onError(error as Error)
    }
  }

  return {
    value: storedValue,
    remove,
    clear
  }
}

export function useLocalStorage<T>(key: string, options?: UseStorageOptions<T>) {
  return useStorage<T>(key, 'localStorage', options)
}

export function useSessionStorage<T>(key: string, options?: UseStorageOptions<T>) {
  return useStorage<T>(key, 'sessionStorage', options)
}