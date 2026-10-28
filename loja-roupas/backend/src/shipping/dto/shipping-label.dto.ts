import { IsString, Matches } from 'class-validator';

export class CreateShippingLabelDto {
  @IsString() @Matches(/^\d{11}$/) recipientCpf: string;
  @IsString() @Matches(/^\d{44}$/) invoiceKey: string;
}
