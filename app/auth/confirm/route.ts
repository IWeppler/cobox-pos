import { type EmailOtpType } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/shared/config/supabase/server'
import { cookies } from 'next/headers'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  
  // Por defecto, lo enviamos a actualizar la contraseña
  const next = searchParams.get('next') ?? '/auth/actualizar-password'

  if (token_hash && type) {
    const cookieStore = await cookies()
    const supabase = createClient(cookieStore)

    // Canjeamos el token seguro por una sesión válida
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash,
    })

    if (!error) {
      // Redirigimos a la pantalla limpia sin el token expuesto en la URL
      return NextResponse.redirect(new URL(next, request.url))
    }
  }

  // Si el enlace expiró o es inválido, lo mandamos de vuelta al login con un error
  return NextResponse.redirect(new URL('/auth?error=Enlace expirado o inválido', request.url))
}