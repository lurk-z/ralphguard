import { redirect } from 'next/navigation'

// Login has been retired — send anyone hitting /login straight into the app.
export default function LoginPage() {
  redirect('/projects')
}
