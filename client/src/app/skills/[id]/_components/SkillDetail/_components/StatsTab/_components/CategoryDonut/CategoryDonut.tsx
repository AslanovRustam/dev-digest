/* CategoryDonut — findings by category as a recharts donut + a count legend.
   (The kit's Donut formats values as dollars, so it is not reused here.) */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Cell, Pie, PieChart } from "recharts";
import { panel } from "../../panelStyles";
import { DONUT_SIZE, DONUT_STROKE } from "./constants";
import { toSlices } from "./helpers";
import { s } from "./styles";

export function CategoryDonut({
  byCategory,
  windowDays,
}: {
  byCategory: { category: string; count: number }[];
  windowDays: number;
}) {
  const t = useTranslations("skills");
  const slices = toSlices(byCategory);
  const outer = DONUT_SIZE / 2;

  return (
    <div style={panel.box}>
      <div style={panel.label}>{t("stats.categoriesTitle")}</div>
      {slices.length === 0 ? (
        <div style={panel.empty}>{t("stats.categoriesEmpty", { days: windowDays })}</div>
      ) : (
        <div style={s.body}>
          <PieChart width={DONUT_SIZE} height={DONUT_SIZE}>
            <Pie
              data={slices}
              dataKey="count"
              nameKey="category"
              cx="50%"
              cy="50%"
              innerRadius={outer - DONUT_STROKE}
              outerRadius={outer}
              startAngle={90}
              endAngle={-270}
              isAnimationActive={false}
              stroke="none"
            >
              {slices.map((sl) => (
                <Cell key={sl.category} fill={sl.color} />
              ))}
            </Pie>
          </PieChart>
          <ul style={s.legend}>
            {slices.map((sl) => (
              <li key={sl.category} style={s.legendRow}>
                <span style={s.swatch(sl.color)} />
                <span style={s.legendLabel}>{sl.category}</span>
                <span className="mono tnum" style={s.legendCount}>
                  {sl.count}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
