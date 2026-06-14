export interface Product {
  id: number;
  title: string;
  description: string;
  price: number;
  discountPercentage: number;
  rating: number;
  category: string;
  thumbnail: string;
  availabilityStatus: string;
  brand?: string;
}

export interface ProductDetail extends Product {
  stock: number;
  images: string[];
  warrantyInformation: string;
  returnPolicy: string;
  shippingInformation: string;
  reviews: Array<{ rating: number; comment: string; reviewerName: string }>;
}
