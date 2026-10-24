"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, MonoLink } from "@devdigest/ui";
import type { DownstreamImpact } from "@devdigest/shared";
import { pathSegments, symbolLabel } from "../../helpers";
import { s } from "./styles";

interface BlastTreeProps {
  downstream: DownstreamImpact[];
  kinds: ReadonlyMap<string, string>;
  hrefFor: (file: string, line: number) => string | null;
}

export function BlastTree({ downstream, kinds, hrefFor }: BlastTreeProps) {
  const t = useTranslations("blast");
  const [open, setOpen] = React.useState<ReadonlySet<string>>(() => {
    const first = downstream[0];
    return new Set(first ? [first.symbol] : []);
  });

  const toggle = (symbol: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(symbol)) next.delete(symbol);
      else next.add(symbol);
      return next;
    });

  return (
    <div style={s.list}>
      {downstream.map((d) => {
        const isOpen = open.has(d.symbol);
        return (
          <div key={d.symbol}>
            <button type="button" aria-expanded={isOpen} onClick={() => toggle(d.symbol)} style={s.rowButton}>
              <Icon.ChevronRight size={14} style={{ ...s.chevron, ...(isOpen ? s.chevronOpen : null) }} />
              <Icon.Code size={14} style={{ color: "var(--accent)", flexShrink: 0 }} />
              <span className="mono" style={s.symbol}>
                {symbolLabel(d.symbol, kinds.get(d.symbol))}
              </span>
              <span style={s.count}>{t("callerCount", { count: d.callers.length })}</span>
            </button>
            {isOpen && (
              <div style={s.panel}>
                {d.callers.length > 0 && (
                  <ul style={s.callers}>
                    {d.callers.map((c) => {
                      const href = hrefFor(c.file, c.line);
                      // <wbr> after each "/" lets a long path wrap at a segment instead of overflowing the card.
                      const label = pathSegments(`${c.file}:${c.line}`).map((seg, i) => (
                        <React.Fragment key={i}>
                          {seg}
                          <wbr />
                        </React.Fragment>
                      ));
                      return (
                        <li key={`${c.file}:${c.line}:${c.name}`} style={s.caller}>
                          <Icon.CornerDownRight size={13} style={s.callerIcon} />
                          <span style={s.callerLabel}>
                            {href ? (
                              <MonoLink href={href}>{label}</MonoLink>
                            ) : (
                              <span className="mono" style={s.callerText}>
                                {label}
                              </span>
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {d.endpoints_affected.length > 0 && (
                  <div style={s.chips}>
                    {d.endpoints_affected.map((e) => (
                      <Badge key={e} mono icon="Globe" color="var(--accent-text)" bg="var(--accent-bg)">
                        {e}
                      </Badge>
                    ))}
                  </div>
                )}
                {d.crons_affected.length > 0 && (
                  <div style={s.chips}>
                    {d.crons_affected.map((c) => (
                      <Badge key={c} mono icon="Clock" color="var(--warn)" bg="var(--warn-bg)">
                        {c}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
