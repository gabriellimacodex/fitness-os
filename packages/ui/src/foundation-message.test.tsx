import { describe, expect, it } from 'vitest';

import { FoundationMessage } from './foundation-message.js';

describe('FoundationMessage', () => {
  it('renders the foundation heading and message inside a main landmark', () => {
    const element = FoundationMessage();

    expect(element.type).toBe('main');
    expect(element.props.className).toBe('foundation');

    const [heading, paragraph] = element.props.children;

    expect(heading.type).toBe('h1');
    expect(heading.props.children).toBe('Fitness OS');

    expect(paragraph.type).toBe('p');
    expect(paragraph.props.children).toBe('Engineering foundation ready.');
  });
});
