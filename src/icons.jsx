// Small outline icons matching Excalidraw's menu style.
const Icon = ({ children }) => (
  <svg
    viewBox="0 0 24 24"
    width="20"
    height="20"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

export const icons = {
  file: (
    <Icon>
      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
      <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z" />
      <path d="M12 11v6M9 14h6" />
    </Icon>
  ),
  folder: (
    <Icon>
      <path d="M5 4h4l3 3h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2" />
    </Icon>
  ),
  save: (
    <Icon>
      <path d="M6 4h10l4 4v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2" />
      <path d="M12 14m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0" />
      <path d="M14 4v4H8V4" />
    </Icon>
  ),
  saveAs: (
    <Icon>
      <path d="M6 4h10l4 4v4" />
      <path d="M12 20H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2" />
      <path d="M14 4v4H8V4" />
      <path d="M18.4 15.6l-3.9 3.9H13v-1.5l3.9-3.9a1.06 1.06 0 0 1 1.5 1.5" />
    </Icon>
  ),
  image: (
    <Icon>
      <path d="M15 8h.01" />
      <path d="M6 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2" />
      <path d="M4 15l4-4c.928-.893 2.072-.893 3 0l5 5" />
      <path d="M14 14l1-1c.928-.893 2.072-.893 3 0l2 2" />
    </Icon>
  ),
};
