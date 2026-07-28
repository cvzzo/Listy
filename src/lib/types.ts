export type Family = {
  id: string
  name: string
  inviteCode: string
}

export type Member = {
  id: string
  familyId: string
  displayName: string
}

export type List = {
  id: string
  familyId: string
  name: string
  position: number
  /** Quando andare a fare la spesa. Le righe create prima di questo campo non ce l'hanno. */
  shoppingAt?: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export type Category = {
  id: string
  familyId: string
  listId: string
  name: string
  position: number
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export type Item = {
  id: string
  familyId: string
  listId: string
  categoryId: string | null
  name: string
  quantity: string | null
  checked: boolean
  position: number
  addedBy: string
  addedByName: string
  checkedBy: string | null
  checkedByName: string | null
  checkedAt: string | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}
