import { useApp } from '../lib/store'
import GenieChat from '../components/GenieChat'
import '../styles/genie.css'

export default function Genie() {
  const tenant = useApp((s) => s.tenant) ?? 'data'
  return <div className="gn-page"><GenieChat tenant={tenant} variant="page" /></div>
}
