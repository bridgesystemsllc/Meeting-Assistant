import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SocialProof } from './SocialProof';

describe('SocialProof', () => {
  it('does not render fake logos or stats', () => {
    const { container } = render(<SocialProof />);
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/Acme Corp|TechFlow|Nexus AI|Quantum|Velocity/);
    expect(text).not.toMatch(/10,000\+|50,000\+|98%/);
    expect(text).toMatch(/Zoom/);
  });
});
