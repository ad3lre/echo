export function createBeforeOpenGroupDmModal(deps: {
  closePinsDropdown: () => void;
  clearSearch: () => void;
}) {
  return () => {
    deps.closePinsDropdown();
    deps.clearSearch();
  };
}
