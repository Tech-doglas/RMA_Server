import React from 'react';
import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import Toast from './Toast';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test('success dismisses after five seconds without being reset by parent renders', () => {
  const closed = jest.fn();
  const { rerender } = render(<Toast type="success" message="Saved" onClose={() => closed()} />);
  act(() => jest.advanceTimersByTime(3000));
  rerender(<Toast type="success" message="Saved" onClose={() => closed()} />);
  act(() => jest.advanceTimersByTime(2000));
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(closed).toHaveBeenCalledTimes(1);
});

test('errors stay visible and dismissing does not submit the surrounding form', () => {
  const submit = jest.fn();
  render(<form onSubmit={submit}><Toast type="error" message="Save failed" /></form>);
  act(() => jest.advanceTimersByTime(60000));
  expect(screen.getByRole('alert')).toHaveTextContent('Save failed');
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(submit).not.toHaveBeenCalled();
});

test('messages stack, clear on unmount, and can reappear after a retry', () => {
  const { rerender, unmount } = render(<><Toast type="success" message="Photo saved" /><Toast type="error" message="Save failed" /></>);
  expect(document.querySelectorAll('.app-toast-stack')).toHaveLength(1);
  expect(document.querySelectorAll('.app-toast')).toHaveLength(2);
  fireEvent.click(within(screen.getByRole('alert')).getByRole('button'));
  rerender(<Toast type="error" message="" />);
  rerender(<Toast type="error" message="Save failed" />);
  expect(screen.getByRole('alert')).toHaveTextContent('Save failed');
  unmount();
  expect(document.querySelector('.app-toast-stack')).toBeNull();
});

test('success remains while the user reads with pointer or keyboard focus', () => {
  render(<Toast type="success" message="Saved" />);
  const notification = screen.getByRole('status');
  fireEvent.mouseEnter(notification);
  act(() => jest.advanceTimersByTime(10000));
  expect(notification).toBeInTheDocument();
  fireEvent.focus(screen.getByRole('button'));
  fireEvent.mouseLeave(notification);
  act(() => jest.advanceTimersByTime(10000));
  expect(notification).toBeInTheDocument();
  fireEvent.blur(screen.getByRole('button'));
  act(() => jest.advanceTimersByTime(5000));
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

test('dialog notifications stay inside the native dialog top layer', () => {
  render(<dialog open aria-label="Pallet"><Toast message="Shipment saved" type="success" /></dialog>);
  expect(within(screen.getByRole('dialog')).getByRole('status')).toHaveTextContent('Shipment saved');
  expect(document.body.querySelector(':scope > .app-toast-stack')).toBeNull();
});
