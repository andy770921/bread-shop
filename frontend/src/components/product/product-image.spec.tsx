import { fireEvent, render, screen } from '@testing-library/react';
import { ProductImage } from './product-image';

jest.mock('next/image', () => ({
  __esModule: true,
  default: (props: any) => {
    const imgProps = { ...props };
    delete imgProps.fill;

    // eslint-disable-next-line @next/next/no-img-element
    return <img alt={imgProps.alt} {...imgProps} />;
  },
}));

describe('[product-image]', () => {
  it('renders a controlled fallback when src is missing', () => {
    render(
      <div className="relative h-20 w-20">
        <ProductImage alt="Bread" src={null} sizes="80px" />
      </div>,
    );

    expect(screen.getByTestId('product-image-fallback')).toBeInTheDocument();
    expect(screen.queryByAltText('Bread')).not.toBeInTheDocument();
  });

  it('keeps a loading surface visible until the image finishes loading', () => {
    render(
      <div className="relative h-20 w-20">
        <ProductImage alt="Bread" src="/bread.jpg" sizes="80px" />
      </div>,
    );

    const image = screen.getByAltText('Bread');

    expect(screen.getByTestId('product-image-loading')).toBeInTheDocument();
    expect(image).toHaveClass('opacity-0');

    fireEvent.load(image);

    expect(screen.queryByTestId('product-image-loading')).not.toBeInTheDocument();
    expect(screen.queryByTestId('product-image-fallback')).not.toBeInTheDocument();
    expect(image).toHaveClass('opacity-100');
  });

  it('switches to the controlled fallback when image loading fails', () => {
    render(
      <div className="relative h-20 w-20">
        <ProductImage alt="Bread" src="/bread.jpg" sizes="80px" />
      </div>,
    );

    fireEvent.error(screen.getByAltText('Bread'));

    expect(screen.getByTestId('product-image-fallback')).toBeInTheDocument();
    expect(screen.queryByAltText('Bread')).not.toBeInTheDocument();
  });
});
