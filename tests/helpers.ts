import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const fixture = readFileSync(resolve(process.cwd(), 'tests/fixtures/postings.html'), 'utf8');

export function loadFixture(): void {
  document.documentElement.innerHTML = new DOMParser().parseFromString(fixture, 'text/html').documentElement.innerHTML;
}

export function pageHtml(page: number, total = 5, ids?: string[]): string {
  const doc = new DOMParser().parseFromString(fixture, 'text/html');
  const rows = [...doc.querySelectorAll<HTMLTableRowElement>('tbody tr')];
  const start = (page - 1) * 2 + 1;
  const end = Math.min(start + 1, total);
  const count = Math.max(0, end - start + 1);
  doc.querySelector('tbody')!.replaceChildren(...rows.slice(0, count));
  [...doc.querySelectorAll<HTMLTableRowElement>('tbody tr')].forEach((row, index) => {
    const id = ids?.[index] ?? String(2000 + start + index);
    row.id = `posting${id}`;
    row.cells[3].textContent = id;
    row.cells[4].querySelector('a')!.className = `np-view-btn-${id}`;
  });
  doc.querySelector('.badge-info')!.textContent = String(total);
  doc.querySelector('#totalOverAllDocs')!.textContent = total ? String(start) : '0';
  doc.querySelector('#totalOverAllPacks')!.textContent = String(Math.max(0, end));
  doc.querySelectorAll('.pagination').forEach(pagination => {
    pagination.innerHTML = `<input type="hidden" id="currentPagedynamic" value="${page}"><ul>${[1, 2, 3].map(number => `<li class="${number === page ? 'active' : ''}"><a href="#" onclick="loadPostingTable('', 'ID', 'Reverse', '${number}','advanced','', null)">${number}</a></li>`).join('')}</ul>`;
  });
  return doc.querySelector('#postingsTablePlaceholder')!.innerHTML;
}

export function setPage(page: number, total = 5, ids?: string[]): void {
  document.querySelector('#postingsTablePlaceholder')!.innerHTML = pageHtml(page, total, ids);
}

export function installPagination(onNavigate: (page: number) => void): () => void {
  const listener = (event: MouseEvent) => {
    const anchor = (event.target as Element).closest<HTMLAnchorElement>('.pagination a');
    if (!anchor) return;
    event.preventDefault();
    // Intercept before the preserved inline handler: tests supply the AJAX response.
    event.stopImmediatePropagation();
    onNavigate(Number(anchor.textContent));
  };
  document.addEventListener('click', listener, true);
  return () => document.removeEventListener('click', listener, true);
}
