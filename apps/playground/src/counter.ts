/** Legacy Vite sample retained for manual experiments; it never renders HTML. */
export function setupCounter(element: HTMLButtonElement): void {
  let counter = 0;
  const setCounter = (count: number): void => {
    counter = count;
    element.textContent = `Count is ${counter}`;
  };
  element.addEventListener('click', () => setCounter(counter + 1));
  setCounter(0);
}
