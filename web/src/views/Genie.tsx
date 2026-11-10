import { Link } from 'react-router-dom'
import { data } from '../lib/data'
import { useApp } from '../lib/store'
import { Page, Card, Note } from '../components/ui'
import { GenieChat, GENIE_URL } from '../components/GenieDock'
import '../styles/genie.css'

const TABLES = ['blind_scored', 'validation_scored', 'clean_features', 'quarantine', 'quality_findings', 'model_comparison', 'snapshot_audit']

export default function Genie() {
  const tenant = useApp((s) => s.tenant) ?? 'data'
  return (
    <Page eyebrow="VP of Data · Genie" title="Ask Genie">
      <div className="gn-layout">
        <Card eyebrow="Conversation" title="Chat with the repaired data">
          <GenieChat tenant={tenant} />
        </Card>
        <div className="gn-side">
          <Card eyebrow="Tables" title={data.meta.schema}>
            <ul className="gn-tables">{TABLES.map((t) => <li key={t} className="mono">{t}</li>)}</ul>
            <Note>Genie reads these tables only. Blind outcomes are unknown.</Note>
          </Card>
          <Card eyebrow="Databricks" title="Open Genie space">
            <a className="btn" href={GENIE_URL} target="_blank" rel="noreferrer">Open in Databricks Genie</a>
          </Card>
          <Link className="note" to="/">Genie is also available as a chat dock in every view.</Link>
        </div>
      </div>
    </Page>
  )
}
