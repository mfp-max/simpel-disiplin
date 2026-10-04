"use client";

import { Bar, BarChart, CartesianGrid, LabelList, Line, LineChart, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import type { TitikGrafik } from "@/lib/laporan";

const konfig = { nilai: { label: "Kasus", color: "var(--chart-1)" } } satisfies ChartConfig;

function potong(s: string, n = 18) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

/** Tabel tersembunyi untuk pembaca layar + ringkasan teks yang terlihat. */
function Aksesibel({ data, judul, labelKolom }: { data: TitikGrafik[]; judul: string; labelKolom: string }) {
  return (
    <table className="sr-only">
      <caption>{judul}</caption>
      <thead>
        <tr><th scope="col">{labelKolom}</th><th scope="col">Jumlah kasus</th></tr>
      </thead>
      <tbody>
        {data.map((d) => (
          <tr key={d.label}><th scope="row">{d.kunci ?? d.label}</th><td>{d.nilai}</td></tr>
        ))}
      </tbody>
    </table>
  );
}

function BelumAda() {
  return <p className="flex min-h-32 items-center justify-center rounded-lg border border-dashed px-4 text-center text-sm text-muted-foreground">Belum ada data kasus untuk grafik ini.</p>;
}

/** Batang mendatar satu seri — label kategori panjang tetap terbaca di ponsel. */
export function GrafikBatang({ id, data, judul, labelKolom }: { id: string; data: TitikGrafik[]; judul: string; labelKolom: string }) {
  const total = data.reduce((s, d) => s + d.nilai, 0);
  if (!total) return <BelumAda />;
  const teratas = [...data].sort((a, b) => b.nilai - a.nilai)[0];
  return (
    <figure className="space-y-2">
      <div aria-hidden="true">
        <ChartContainer id={id} config={konfig} className="aspect-auto w-full" style={{ height: Math.max(120, data.length * 38 + 24) }}>
          <BarChart data={data} layout="vertical" margin={{ left: 0, right: 36, top: 4, bottom: 4 }} barCategoryGap={8}>
            <CartesianGrid horizontal={false} strokeDasharray="3 3" />
            <XAxis type="number" allowDecimals={false} hide />
            <YAxis type="category" dataKey="label" width={128} tickLine={false} axisLine={false} tickFormatter={(v: string) => potong(v)} tick={{ fontSize: 13 }} />
            <ChartTooltip cursor={{ fillOpacity: 0.4 }} content={<ChartTooltipContent hideIndicator />} />
            <Bar dataKey="nilai" fill="var(--color-nilai)" radius={4} maxBarSize={22}>
              <LabelList dataKey="nilai" position="right" className="fill-foreground" fontSize={13} />
            </Bar>
          </BarChart>
        </ChartContainer>
      </div>
      <figcaption className="text-sm text-muted-foreground">
        Terbanyak: {teratas.label} ({teratas.nilai} dari {total} kasus).
      </figcaption>
      <Aksesibel data={data} judul={judul} labelKolom={labelKolom} />
    </figure>
  );
}

/** Garis tren bulanan satu seri. */
export function GrafikTren({ data, judul }: { data: TitikGrafik[]; judul: string }) {
  const total = data.reduce((s, d) => s + d.nilai, 0);
  if (!total) return <BelumAda />;
  const puncak = [...data].sort((a, b) => b.nilai - a.nilai)[0];
  const akhir = data[data.length - 1];
  return (
    <figure className="space-y-2">
      <div aria-hidden="true">
        <ChartContainer id="tren" config={konfig} className="aspect-auto h-56 w-full">
          <LineChart data={data} margin={{ left: 0, right: 12, top: 12, bottom: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} interval="preserveStartEnd" minTickGap={16} tick={{ fontSize: 12 }} />
            <YAxis allowDecimals={false} width={28} tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
            <ChartTooltip content={<ChartTooltipContent labelFormatter={(_, p) => (p?.[0]?.payload as TitikGrafik | undefined)?.kunci ?? ""} />} />
            <Line dataKey="nilai" type="monotone" stroke="var(--color-nilai)" strokeWidth={2} dot={{ r: 4, fill: "var(--color-nilai)", strokeWidth: 2, stroke: "var(--card)" }} activeDot={{ r: 6 }} />
          </LineChart>
        </ChartContainer>
      </div>
      <figcaption className="text-sm text-muted-foreground">
        {total} kasus dalam 12 bulan; puncak {puncak.kunci} ({puncak.nilai}); bulan ini {akhir.nilai}.
      </figcaption>
      <Aksesibel data={data} judul={judul} labelKolom="Bulan" />
    </figure>
  );
}
