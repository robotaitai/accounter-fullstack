import type { JSX } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  AlertCircle,
  ArrowRight,
  BarChart2,
  CheckCircle2,
  Clock,
  Database,
  FileText,
  RefreshCw,
  TrendingUp,
  Wifi,
  WifiOff,
  Zap,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useQuery } from 'urql';
import { Badge } from '../../ui/badge.js';
import { Button } from '../../ui/button.js';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card.js';
import { ROUTES } from '../../../router/routes.js';

// ---------------------------------------------------------------------------
// GraphQL
// ---------------------------------------------------------------------------

const DASHBOARD_QUERY = `
  query DashboardStats {
    dashboardStats {
      generatedAt
      sources {
        sourceConnectionId
        provider
        displayName
        status
        lastSyncAt
        lastSyncError
        rowCount
        oldestRecord
        newestRecord
        monthlyData {
          month
          count
        }
      }
      financial {
        totalCharges
        totalTransactions
        transactionsThisMonth
        transactionsLastMonth
        totalDocuments
      }
    }
    workspaceSettings {
      companyName
    }
  }
`;

const INCOME_EXPENSE_QUERY = `
  query DashboardFinancialOverview($filters: IncomeExpenseChartFilters!) {
    incomeExpenseChart(filters: $filters) {
      currency
      monthlyData {
        date
        income { raw formatted }
        expense { raw formatted }
        balance { raw formatted }
      }
    }
  }
`;

const ATTENTION_QUERY = `
  query DashboardAttention {
    missingInvoices: allCharges(page: 1, limit: 1, filters: { withoutInvoice: true }) {
      pageInfo { totalPages }
    }
    missingReceipts: allCharges(page: 1, limit: 1, filters: { withoutReceipt: true }) {
      pageInfo { totalPages }
    }
    unapproved: allCharges(page: 1, limit: 1, filters: { accountantStatus: UNAPPROVED }) {
      pageInfo { totalPages }
    }
    missingInfo: chargesWithMissingRequiredInfo(page: 1, limit: 1) {
      pageInfo { totalPages }
    }
  }
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDateTime(val: string | null | undefined): string {
  if (!val) return 'Never';
  const d = new Date(val);
  if (isNaN(d.getTime())) return val;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return d.toLocaleDateString();
}

function formatDate(val: string | null | undefined): string {
  if (!val) return '-';
  const d = new Date(val);
  if (isNaN(d.getTime())) return val;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toString();
}

/** Abbreviate "YYYY-MM" to "MMM YY" for axis labels */
function fmtMonth(yyyyMM: string): string {
  const [y, m] = yyyyMM.split('-');
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleString('default', { month: 'short', year: '2-digit' });
}

type MonthlyPoint = { month: string; count: number };

type SourceRow = {
  sourceConnectionId: string;
  provider: string;
  displayName: string;
  status: string;
  lastSyncAt: string | null;
  lastSyncError: string | null;
  rowCount: number;
  oldestRecord: string | null;
  newestRecord: string | null;
  monthlyData: MonthlyPoint[];
};

const PROVIDER_CATEGORY: Record<string, string> = {
  MIZRAHI: 'Bank',
  HAPOALIM: 'Bank',
  DISCOUNT: 'Bank',
  LEUMI: 'Bank',
  ISRACARD: 'Credit Card',
  AMEX: 'Credit Card',
  CAL: 'Credit Card',
  MAX: 'Credit Card',
  PRIORITY: 'ERP',
  GREEN_INVOICE: 'Integration',
  GOOGLE_DRIVE: 'Integration',
  GMAIL: 'Integration',
  DEEL: 'Integration',
};

const PROVIDER_DATA_TYPE: Record<string, string> = {
  MIZRAHI: 'Bank transactions',
  HAPOALIM: 'Bank transactions',
  DISCOUNT: 'Bank transactions',
  LEUMI: 'Bank transactions',
  ISRACARD: 'Credit card transactions',
  AMEX: 'Credit card transactions',
  CAL: 'Credit card transactions',
  MAX: 'Credit card transactions',
  PRIORITY: 'Invoices',
  GREEN_INVOICE: 'Invoices',
  GOOGLE_DRIVE: 'Documents',
  GMAIL: 'Emails',
  DEEL: 'Payroll records',
};

function statusDot(status: string, lastSyncError: string | null): JSX.Element {
  const s = status.toLowerCase();
  if (s === 'active' && !lastSyncError)
    return <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block shrink-0" />;
  if (s === 'error' || lastSyncError)
    return <span className="w-2 h-2 rounded-full bg-red-500 inline-block shrink-0" />;
  if (s === 'pending')
    return <span className="w-2 h-2 rounded-full bg-amber-400 inline-block shrink-0" />;
  return <span className="w-2 h-2 rounded-full bg-slate-300 inline-block shrink-0" />;
}

// ---------------------------------------------------------------------------
// MiniBarChart - compact monthly chart inside a source card
// ---------------------------------------------------------------------------

function MiniBarChart({ data }: { data: MonthlyPoint[] }): JSX.Element | null {
  if (data.length === 0) return null;
  const chartData = data.map(d => ({ ...d, label: fmtMonth(d.month) }));
  return (
    <div className="mt-2 h-20">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 2, right: 2, left: -28, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 9, fill: '#94a3b8' }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={{ fontSize: 11, padding: '4px 8px', borderRadius: 6 }}
            formatter={(v: number) => [v, 'Records']}
            labelFormatter={l => `Month: ${l}`}
          />
          <Bar dataKey="count" fill="#6366f1" radius={[2, 2, 0, 0]} maxBarSize={12} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SourceCard
// ---------------------------------------------------------------------------

function SourceCard({ source }: { source: SourceRow }): JSX.Element {
  const hasError = !!source.lastSyncError || source.status.toLowerCase() === 'error';
  const category = PROVIDER_CATEGORY[source.provider] ?? 'Source';
  const dataType = PROVIDER_DATA_TYPE[source.provider] ?? 'Records';
  const hasData = source.monthlyData.length > 0;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          {statusDot(source.status, source.lastSyncError)}
          <div>
            <div className="font-medium text-sm text-slate-900">{source.displayName}</div>
            <div className="text-xs text-slate-400">{category}</div>
          </div>
        </div>
        <Badge
          variant="outline"
          className={
            hasError
              ? 'text-red-600 border-red-200 bg-red-50 text-xs'
              : source.rowCount > 0
                ? 'text-emerald-700 border-emerald-200 bg-emerald-50 text-xs'
                : 'text-slate-500 border-slate-200 text-xs'
          }
        >
          {hasError ? 'Error' : source.rowCount > 0 ? 'Active' : 'Empty'}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        <div className="text-slate-400">Last sync</div>
        <div className="text-slate-700 font-medium text-right">
          {formatDateTime(source.lastSyncAt)}
        </div>

        <div className="text-slate-400">Type</div>
        <div className="text-slate-700 font-medium text-right">{dataType}</div>

        <div className="text-slate-400">Records</div>
        <div className="text-slate-700 font-medium text-right">{formatCount(source.rowCount)}</div>

        {source.oldestRecord && (
          <>
            <div className="text-slate-400">Since</div>
            <div className="text-slate-700 text-right">{formatDate(source.oldestRecord)}</div>
          </>
        )}

        {source.newestRecord && (
          <>
            <div className="text-slate-400">Latest</div>
            <div className="text-slate-700 text-right">{formatDate(source.newestRecord)}</div>
          </>
        )}
      </div>

      {hasError && source.lastSyncError && (
        <div className="rounded bg-red-50 border border-red-100 p-2 text-xs text-red-700 flex gap-1.5 items-start">
          <AlertCircle size={12} className="mt-0.5 shrink-0" />
          <span className="line-clamp-3">{source.lastSyncError}</span>
        </div>
      )}

      {hasData && <MiniBarChart data={source.monthlyData} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// StatCard
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  sub,
  icon,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: JSX.Element;
  accent?: 'green' | 'blue' | 'amber' | 'slate';
}): JSX.Element {
  const colors: Record<string, string> = {
    green: 'text-emerald-600 bg-emerald-50',
    blue: 'text-blue-600 bg-blue-50',
    amber: 'text-amber-600 bg-amber-50',
    slate: 'text-slate-600 bg-slate-100',
  };
  const cls = colors[accent ?? 'slate'];

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 flex items-center gap-4">
      <div className={`rounded-lg p-2.5 ${cls}`}>{icon}</div>
      <div>
        <div className="text-2xl font-semibold text-slate-900">{formatCount(Number(value))}</div>
        <div className="text-sm text-slate-500">{label}</div>
        {sub && <div className="text-xs text-slate-400 mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AllSourcesMonthlyChart - full-width combined monthly chart
// ---------------------------------------------------------------------------

function AllSourcesMonthlyChart({ sources }: { sources: SourceRow[] }): JSX.Element | null {
  // Build a unified month list across all sources (last 26 months)
  const monthSet = new Set<string>();
  for (const s of sources) {
    for (const d of s.monthlyData) monthSet.add(d.month);
  }
  const months = Array.from(monthSet).sort();
  if (months.length === 0) return null;

  const BAR_COLORS = [
    '#6366f1', '#10b981', '#f59e0b', '#3b82f6', '#ec4899',
    '#14b8a6', '#8b5cf6', '#f97316', '#06b6d4', '#84cc16',
  ];

  // Only include sources that have at least one data point
  const activeSources = sources.filter(s => s.monthlyData.length > 0);
  if (activeSources.length === 0) return null;

  const chartData = months.map(month => {
    const row: Record<string, string | number> = { label: fmtMonth(month) };
    for (const s of activeSources) {
      const pt = s.monthlyData.find(d => d.month === month);
      row[s.displayName] = pt?.count ?? 0;
    }
    return row;
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <BarChart2 size={16} />
          Monthly Records (last 26 months)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: '#94a3b8' }}
                tickLine={false}
                axisLine={false}
                interval={Math.floor(months.length / 12)}
              />
              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
                formatter={(v: number, name: string) => [formatCount(v), name]}
              />
              {activeSources.map((s, i) => (
                <Bar
                  key={s.sourceConnectionId}
                  dataKey={s.displayName}
                  stackId="a"
                  fill={BAR_COLORS[i % BAR_COLORS.length]}
                  radius={i === activeSources.length - 1 ? [2, 2, 0, 0] : undefined}
                  maxBarSize={20}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="flex flex-wrap gap-3 mt-3">
          {activeSources.map((s, i) => (
            <div key={s.sourceConnectionId} className="flex items-center gap-1.5 text-xs text-slate-600">
              <span
                className="w-2.5 h-2.5 rounded-sm inline-block shrink-0"
                style={{ background: BAR_COLORS[i % BAR_COLORS.length] }}
              />
              {s.displayName}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// formatAmount
// ---------------------------------------------------------------------------

function formatAmount(raw: number, currency = 'ILS'): string {
  const sym = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : '₪';
  const abs = Math.abs(raw);
  let s: string;
  if (abs >= 1_000_000) s = `${(abs / 1_000_000).toFixed(1)}M`;
  else if (abs >= 1_000) s = `${(abs / 1_000).toFixed(0)}k`;
  else s = abs.toFixed(0);
  return `${raw < 0 ? '-' : ''}${sym}${s}`;
}

// ---------------------------------------------------------------------------
// FinancialOverviewSection
// ---------------------------------------------------------------------------

function FinancialOverviewSection(): JSX.Element {
  const now = new Date();
  const toDate = now.toISOString().slice(0, 10);
  const fromDate = new Date(now.getFullYear() - 1, now.getMonth(), 1).toISOString().slice(0, 10);

  const [{ data, fetching }] = useQuery({
    query: INCOME_EXPENSE_QUERY,
    variables: { filters: { fromDate, toDate } },
  });

  const monthly = data?.incomeExpenseChart?.monthlyData ?? [];
  const currency = data?.incomeExpenseChart?.currency ?? 'ILS';
  const currentYear = now.getFullYear().toString();

  const ytdIncome = monthly
    .filter((m: { date: string }) => m.date.startsWith(currentYear))
    .reduce((s: number, m: { income: { raw: number } }) => s + m.income.raw, 0);
  const ytdExpense = monthly
    .filter((m: { date: string }) => m.date.startsWith(currentYear))
    .reduce((s: number, m: { expense: { raw: number } }) => s + m.expense.raw, 0);
  const ytdNet = ytdIncome - ytdExpense;

  const chartData = monthly.map((m: { date: string; income: { raw: number }; expense: { raw: number } }) => ({
    label: fmtMonth(m.date.slice(0, 7)),
    Income: m.income.raw,
    Expense: -m.expense.raw,
  }));

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">
          Financial Overview
        </h2>
        <Link
          to={ROUTES.CHARTS.MONTHLY_INCOME_EXPENSE}
          className="text-xs text-blue-600 hover:underline flex items-center gap-1"
        >
          Full chart <ArrowRight size={12} />
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <div className="text-xs text-emerald-600 font-medium mb-1">YTD Income</div>
          <div className="text-xl font-semibold text-emerald-800">
            {fetching ? '—' : formatAmount(ytdIncome, currency)}
          </div>
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <div className="text-xs text-red-600 font-medium mb-1">YTD Expenses</div>
          <div className="text-xl font-semibold text-red-800">
            {fetching ? '—' : formatAmount(ytdExpense, currency)}
          </div>
        </div>
        <div
          className={`rounded-lg border p-4 ${
            ytdNet >= 0 ? 'border-blue-200 bg-blue-50' : 'border-amber-200 bg-amber-50'
          }`}
        >
          <div
            className={`text-xs font-medium mb-1 ${ytdNet >= 0 ? 'text-blue-600' : 'text-amber-600'}`}
          >
            Net {currentYear}
          </div>
          <div
            className={`text-xl font-semibold ${ytdNet >= 0 ? 'text-blue-800' : 'text-amber-800'}`}
          >
            {fetching ? '—' : formatAmount(ytdNet, currency)}
          </div>
        </div>
      </div>

      {chartData.length > 0 && (
        <Card>
          <CardContent className="pt-4">
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 4, right: 8, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: '#94a3b8' }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: '#94a3b8' }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: unknown) => formatAmount(Number(v), currency)}
                  />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                    formatter={(v: unknown, name: string) => [
                      formatAmount(Math.abs(Number(v)), currency),
                      name,
                    ]}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                    formatter={(value: string) => (
                      <span className="text-slate-600">{value}</span>
                    )}
                  />
                  <Bar
                    dataKey="Income"
                    fill="#10b981"
                    radius={[2, 2, 0, 0]}
                    maxBarSize={18}
                    stackId="stack"
                  />
                  <Bar
                    dataKey="Expense"
                    fill="#ef4444"
                    radius={[2, 2, 0, 0]}
                    maxBarSize={18}
                    stackId="stack"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {!fetching && chartData.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">
          No financial data yet. Import invoices or sync your sources to see income and expense trends.
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// NeedsAttentionSection
// ---------------------------------------------------------------------------

interface AttentionItem {
  label: string;
  count: number;
  href: string;
  description: string;
  severity: 'high' | 'medium';
}

function AttentionCard({
  item,
  fetching,
}: {
  item: AttentionItem;
  fetching: boolean;
}): JSX.Element {
  const isClean = item.count === 0;
  const borderCls = isClean
    ? 'border-emerald-200 bg-emerald-50 hover:border-emerald-300'
    : item.severity === 'high'
      ? 'border-red-200 bg-red-50 hover:border-red-300'
      : 'border-amber-200 bg-amber-50 hover:border-amber-300';
  const countCls = isClean
    ? 'text-emerald-700'
    : item.severity === 'high'
      ? 'text-red-700'
      : 'text-amber-700';

  return (
    <Link
      to={item.href}
      className={`rounded-lg border p-4 flex items-center justify-between group transition-shadow hover:shadow-sm ${borderCls}`}
    >
      <div>
        <div className={`text-2xl font-semibold ${countCls}`}>
          {fetching ? '—' : isClean ? 'All clear' : item.count.toLocaleString()}
        </div>
        <div className="text-sm font-medium text-slate-700 mt-0.5">{item.label}</div>
        <div className="text-xs text-slate-400 mt-0.5">{item.description}</div>
      </div>
      <ArrowRight
        size={16}
        className="text-slate-300 group-hover:text-slate-500 transition-colors shrink-0"
      />
    </Link>
  );
}

function NeedsAttentionSection(): JSX.Element {
  const [{ data, fetching }] = useQuery({ query: ATTENTION_QUERY });

  const missingInvoices = data?.missingInvoices?.pageInfo?.totalPages ?? 0;
  const missingReceipts = data?.missingReceipts?.pageInfo?.totalPages ?? 0;
  const unapproved = data?.unapproved?.pageInfo?.totalPages ?? 0;
  const missingInfo = data?.missingInfo?.pageInfo?.totalPages ?? 0;
  const totalIssues = missingInvoices + missingReceipts + unapproved + missingInfo;

  const makeUrl = (filter: Record<string, unknown>) =>
    `${ROUTES.CHARGES.ALL}?chargesFilters=${encodeURIComponent(JSON.stringify(filter))}`;

  const items: AttentionItem[] = [
    {
      label: 'Missing Invoices',
      count: missingInvoices,
      href: makeUrl({ withoutInvoice: true }),
      description: 'Charges without an invoice document',
      severity: 'high',
    },
    {
      label: 'Missing Receipts',
      count: missingReceipts,
      href: makeUrl({ withoutReceipt: true }),
      description: 'Charges without a receipt',
      severity: 'medium',
    },
    {
      label: 'Awaiting Approval',
      count: unapproved,
      href: makeUrl({ accountantStatus: 'UNAPPROVED' }),
      description: 'Not yet approved by accountant',
      severity: 'medium',
    },
    {
      label: 'Missing Information',
      count: missingInfo,
      href: ROUTES.CHARGES.MISSING_INFO,
      description: 'Charges with incomplete required data',
      severity: 'high',
    },
  ];

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">
            Needs Attention
          </h2>
          {!fetching && totalIssues > 0 && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
              {totalIssues.toLocaleString()} total
            </span>
          )}
        </div>
        <Link
          to={ROUTES.CHARGES.MISSING_INFO}
          className="text-xs text-blue-600 hover:underline flex items-center gap-1"
        >
          View all <ArrowRight size={12} />
        </Link>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {items.map(item => (
          <AttentionCard key={item.label} item={item} fetching={fetching} />
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function DashboardPage(): JSX.Element {
  const [{ data, fetching, error }, refetch] = useQuery({ query: DASHBOARD_QUERY });

  const stats = data?.dashboardStats;
  const workspaceName = data?.workspaceSettings?.companyName ?? 'Workspace';
  const now = new Date();
  const monthLabel = now.toLocaleString('default', { month: 'long', year: 'numeric' });

  const banks = (stats?.sources ?? []).filter(s =>
    ['MIZRAHI', 'HAPOALIM', 'DISCOUNT', 'LEUMI'].includes(s.provider),
  );
  const cards = (stats?.sources ?? []).filter(s =>
    ['ISRACARD', 'AMEX', 'CAL', 'MAX'].includes(s.provider),
  );
  const integrations = (stats?.sources ?? []).filter(
    s => !['MIZRAHI', 'HAPOALIM', 'DISCOUNT', 'LEUMI', 'ISRACARD', 'AMEX', 'CAL', 'MAX'].includes(s.provider),
  );

  const fin = stats?.financial;
  const monthDelta =
    fin && fin.transactionsLastMonth > 0
      ? Math.round(
          ((fin.transactionsThisMonth - fin.transactionsLastMonth) / fin.transactionsLastMonth) *
            100,
        )
      : null;

  return (
    <div className="flex flex-col gap-6 p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{workspaceName}</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Dashboard -{' '}
            {now.toLocaleDateString('en-GB', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch({ requestPolicy: 'network-only' })}
          disabled={fetching}
        >
          <RefreshCw size={14} className={fetching ? 'animate-spin' : ''} />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex gap-2 items-center">
          <AlertCircle size={16} />
          Failed to load dashboard: {error.message}
        </div>
      )}

      {/* Financial Pulse */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">
            Financial Pulse
          </h2>
          <Link
            to={ROUTES.CHARGES.ALL}
            className="text-xs text-blue-600 hover:underline flex items-center gap-1"
          >
            View charges <ArrowRight size={12} />
          </Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="Total Charges"
            value={fin?.totalCharges ?? 0}
            icon={<Activity size={18} />}
            accent="blue"
          />
          <StatCard
            label="Total Transactions"
            value={fin?.totalTransactions ?? 0}
            icon={<Database size={18} />}
            accent="slate"
          />
          <StatCard
            label={`Transactions - ${monthLabel}`}
            value={fin?.transactionsThisMonth ?? 0}
            sub={
              monthDelta !== null
                ? `${monthDelta >= 0 ? '+' : ''}${monthDelta}% vs last month`
                : undefined
            }
            icon={<TrendingUp size={18} />}
            accent={monthDelta !== null && monthDelta >= 0 ? 'green' : 'amber'}
          />
          <StatCard
            label="Documents"
            value={fin?.totalDocuments ?? 0}
            icon={<FileText size={18} />}
            accent="slate"
          />
        </div>
      </section>

      {/* Financial Overview — income vs expense chart + YTD KPIs */}
      <FinancialOverviewSection />

      {/* Needs Attention — work queue counts */}
      <NeedsAttentionSection />

      {/* Sources */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">
            Sources & Sync
          </h2>
          <Link
            to={ROUTES.SOURCES}
            className="text-xs text-blue-600 hover:underline flex items-center gap-1"
          >
            Manage sources <ArrowRight size={12} />
          </Link>
        </div>

        {fetching && !stats && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <div
                key={i}
                className="rounded-lg border border-slate-200 bg-slate-50 h-36 animate-pulse"
              />
            ))}
          </div>
        )}

        {!fetching && stats?.sources.length === 0 && (
          <div className="rounded-lg border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
            No sources configured yet.{' '}
            <Link to={ROUTES.SOURCES} className="text-blue-600 hover:underline">
              Add a source
            </Link>
          </div>
        )}

        {banks.length > 0 && (
          <div className="mb-4">
            <div className="text-xs font-medium text-slate-400 mb-2 uppercase tracking-wide">
              Bank Accounts
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {banks.map(s => (
                <SourceCard key={s.sourceConnectionId} source={s} />
              ))}
            </div>
          </div>
        )}

        {cards.length > 0 && (
          <div className="mb-4">
            <div className="text-xs font-medium text-slate-400 mb-2 uppercase tracking-wide">
              Credit Cards
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {cards.map(s => (
                <SourceCard key={s.sourceConnectionId} source={s} />
              ))}
            </div>
          </div>
        )}

        {integrations.length > 0 && (
          <div>
            <div className="text-xs font-medium text-slate-400 mb-2 uppercase tracking-wide">
              Integrations
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {integrations.map(s => (
                <SourceCard key={s.sourceConnectionId} source={s} />
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Combined monthly chart across all sources */}
      {stats && stats.sources.length > 0 && (
        <section>
          <AllSourcesMonthlyChart sources={stats.sources} />
        </section>
      )}

      {/* System Health */}
      <section>
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3">
          System Health
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-lg border border-slate-200 bg-white p-4 flex items-center gap-3">
            {fetching ? (
              <Wifi size={18} className="text-slate-400 animate-pulse" />
            ) : error ? (
              <WifiOff size={18} className="text-red-500" />
            ) : (
              <CheckCircle2 size={18} className="text-emerald-500" />
            )}
            <div>
              <div className="text-sm font-medium text-slate-800">GraphQL API</div>
              <div className="text-xs text-slate-400">{error ? 'Unreachable' : 'Connected'}</div>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4 flex items-center gap-3">
            <Zap size={18} className="text-emerald-500" />
            <div>
              <div className="text-sm font-medium text-slate-800">Sources configured</div>
              <div className="text-xs text-slate-400">{stats?.sources.length ?? 0} connected</div>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4 flex items-center gap-3">
            <Clock size={18} className="text-slate-400" />
            <div>
              <div className="text-sm font-medium text-slate-800">Last refreshed</div>
              <div className="text-xs text-slate-400">
                {stats ? formatDateTime(stats.generatedAt) : '-'}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
