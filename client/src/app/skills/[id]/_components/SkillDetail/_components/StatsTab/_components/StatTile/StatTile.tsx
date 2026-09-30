/* StatTile — uppercase label, big value, optional visual on the top right. */
"use client";

import React from "react";
import { panel } from "../../panelStyles";
import { s } from "./styles";

export function StatTile({
  label,
  value,
  valueColor,
  aside,
}: {
  label: string;
  value: string;
  valueColor?: string;
  aside?: React.ReactNode;
}) {
  return (
    <div style={panel.box} role="group" aria-label={label}>
      <div style={s.top}>
        <span style={panel.label}>{label}</span>
        {aside}
      </div>
      <div className="tnum" style={s.value(valueColor)}>
        {value}
      </div>
    </div>
  );
}
