import type {EditorData, User} from "~/types";

export function fullName(user: User) {
    if (user.first_name || user.last_name) {
        return `${user.first_name} ${user.last_name}`
    }
    return user.username
}


export function formatDate(str: number | string) {
    const date = new Date(str)
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString()
}

export function formatNumber(num: number) {
    return num ?
        num.toLocaleString()
            .replaceAll(".", "_")
            .replaceAll(",", ".")
            .replaceAll("_", ",")
        : 0
}
