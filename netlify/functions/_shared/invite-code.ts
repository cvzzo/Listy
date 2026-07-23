import { customAlphabet } from 'nanoid'

// Alfabeto senza caratteri ambigui (0/O, 1/I/L) per codici leggibili a voce/scritti a mano
const generate = customAlphabet('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', 6)

export function generateInviteCode() {
  return generate()
}
