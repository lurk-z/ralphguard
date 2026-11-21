import type { Role } from './workflow'

export const ROLE_LABEL: Record<Role, string> = {
  director: 'หัวหน้าแล็บ',
  researcher: 'นักวิจัย',
  formulator: 'นักพัฒนาสูตร',
  analyst: 'นักวิเคราะห์',
  evaluator: 'ผู้ประเมิน',
}
