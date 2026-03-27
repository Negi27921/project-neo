import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table'
import { useMemo, useState } from 'react'
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'

interface Props<T> {
  data: T[]
  columns: ColumnDef<T, any>[]
  globalFilter?: string
  pageSize?: number
  rowClassName?: (row: T) => string
  onRowClick?: (row: T) => void
}

export default function DataTable<T>({
  data, columns, globalFilter = '', pageSize = 50,
  rowClassName, onRowClick,
}: Props<T>) {
  const [sorting, setSorting] = useState<SortingState>([])

  const cols = useMemo(() => columns, [])

  const table = useReactTable({
    data,
    columns: cols,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
  })

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{
        width: '100%',
        borderCollapse: 'collapse',
        fontSize: 11,
        fontFamily: 'var(--font-mono)',
      }}>
        <thead>
          {table.getHeaderGroups().map(hg => (
            <tr key={hg.id}>
              {hg.headers.map(h => (
                <th
                  key={h.id}
                  onClick={h.column.getToggleSortingHandler()}
                  style={{
                    padding: '6px 10px',
                    textAlign: 'left',
                    fontSize: 9,
                    fontWeight: 600,
                    color: 'var(--text-label)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.10em',
                    borderBottom: '1px solid var(--bg-border)',
                    background: 'var(--bg-header)',
                    cursor: h.column.getCanSort() ? 'pointer' : 'default',
                    whiteSpace: 'nowrap',
                    userSelect: 'none',
                    position: 'sticky',
                    top: 0,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {flexRender(h.column.columnDef.header, h.getContext())}
                    {h.column.getCanSort() && (
                      <span style={{ opacity: 0.5 }}>
                        {h.column.getIsSorted() === 'asc' ? <ChevronUp size={10} /> :
                         h.column.getIsSorted() === 'desc' ? <ChevronDown size={10} /> :
                         <ChevronsUpDown size={10} />}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row, i) => {
            const extraClass = rowClassName ? rowClassName(row.original) : ''
            return (
              <tr
                key={row.id}
                className={extraClass}
                onClick={() => onRowClick?.(row.original)}
                style={{
                  background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                  cursor: onRowClick ? 'pointer' : 'default',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)')}
              >
                {row.getVisibleCells().map(cell => (
                  <td
                    key={cell.id}
                    style={{
                      padding: '7px 10px',
                      borderBottom: '1px solid rgba(17,31,17,0.4)',
                      color: 'var(--text-primary)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>

      {/* Pagination */}
      {table.getPageCount() > 1 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 8,
          padding: '12px 12px 4px',
          fontSize: 11,
          color: 'var(--text-muted)',
          fontFamily: 'var(--font-mono)',
        }}>
          <span>
            Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
            {' '}({table.getFilteredRowModel().rows.length} rows)
          </span>
          <button
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            style={btnStyle}
          >Prev</button>
          <button
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            style={btnStyle}
          >Next</button>
        </div>
      )}
    </div>
  )
}

const btnStyle: React.CSSProperties = {
  padding: '3px 10px',
  background: 'var(--bg-hover)',
  border: '1px solid var(--bg-border)',
  borderRadius: 4,
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  fontSize: 11,
  fontFamily: 'var(--font-mono)',
}
