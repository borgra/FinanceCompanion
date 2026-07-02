import type { ReactNode } from 'react';
import { useId } from 'react';

export type SettingsMenuSection = {
  id: string;
  label: string;
};

export type SettingsMenuProps = {
  isOpen: boolean;
  onOpenChange: (nextOpen: boolean) => void;
  sections: SettingsMenuSection[];
  activeSectionId: string;
  onActiveSectionChange: (nextActiveId: string) => void;
  getPanel: (activeId: string) => ReactNode;
};

export function SettingsMenu({
  isOpen,
  onOpenChange,
  sections,
  activeSectionId,
  onActiveSectionChange,
  getPanel,
}: SettingsMenuProps) {
  const contentId = useId();
  const toggle = () => onOpenChange(!isOpen);

  const activeLabel =
    sections.find((s) => s.id === activeSectionId)?.label ?? sections[0]?.label;

  return (
    <nav className="settings-menu" aria-label="Settings">
      <div className="settings-tablist" role="tablist" aria-label="Settings sections">
        <button
          className="settings-tab settings-menu-header"
          type="button"
          role="tab"
          aria-selected={true}
          aria-expanded={isOpen}
          aria-controls={contentId}
          onClick={toggle}
        >
          <span className="settings-tab-label">{activeLabel}</span>
          <span className="settings-tab-icon" aria-hidden="true">
            {isOpen ? '▾' : '▸'}
          </span>
        </button>
      </div>

      {isOpen ? (
        <div id={contentId} className="settings-panel" role="tabpanel">
          <div className="settings-tablist settings-tablist-inline" role="tablist">
            {sections.map((section) => (
              <button
                key={section.id}
                type="button"
                role="tab"
                aria-selected={section.id === activeSectionId}
                className="settings-tab settings-tab-item"
                onClick={() => onActiveSectionChange(section.id)}
              >
                <span className="settings-tab-label">{section.label}</span>
              </button>
            ))}
          </div>

          <div className="settings-panel-content">{getPanel(activeSectionId)}</div>
        </div>
      ) : null}
    </nav>
  );
}
