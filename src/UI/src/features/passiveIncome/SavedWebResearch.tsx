import { Fragment } from 'react';
import { safeSourceUrl } from './dividendSchedule';

type Citation = { url: string; title: string; start?: number; end?: number };
const objectValue = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;

export function SavedWebResearch({ evidence: value }: { evidence: unknown }) {
  const evidence = objectValue(value);
  if (evidence?.kind !== 'foundry_web_search' || typeof evidence.answer !== 'string') return null;
  const answer = evidence.answer;
  const citations: Citation[] = (Array.isArray(evidence.citations) ? evidence.citations : []).flatMap((entry) => {
    const item = objectValue(entry);
    const url = typeof item?.url === 'string' ? safeSourceUrl(item.url) : undefined;
    return url ? [{ url, title: typeof item?.title === 'string' && item.title ? item.title : url,
      start: typeof item?.start_index === 'number' ? item.start_index : undefined,
      end: typeof item?.end_index === 'number' ? item.end_index : undefined }] : [];
  });
  const sources = [...new Map(citations.map((citation) => [citation.url, citation])).values()];
  let position = 0;
  const parts = citations.filter(({ start, end }) => Number.isInteger(start) && Number.isInteger(end)
    && start! >= 0 && end! > start! && end! <= answer.length).sort((left, right) => left.start! - right.start!).flatMap((citation) => {
    if (citation.start! < position) return [];
    const text = answer.slice(position, citation.start);
    const cited = answer.slice(citation.start, citation.end);
    position = citation.end!;
    return [<Fragment key={`${citation.start}-${citation.end}`}>{text}<a href={citation.url} title={citation.title} target="_blank" rel="noreferrer">{cited}</a></Fragment>];
  });

  return <details className="saved-web-research">
    <summary>Saved AI research and citations</summary>
    <p>AI-generated research with web citations, saved when records were imported. This is not a verbatim copy of the publisher’s page. Coverage may be incomplete; check the linked sources.</p>
    {sources.length ? <ul aria-label="Cited research sources">{sources.map(({ url, title }) => <li key={url}><a href={url} target="_blank" rel="noreferrer">{title}</a></li>)}</ul> : null}
    <div className="saved-web-research-answer" role="region" aria-label="Saved research text" tabIndex={0}>{parts}{answer.slice(position)}</div>
  </details>;
}
