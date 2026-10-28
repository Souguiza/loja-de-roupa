import { IsIn, IsInt, IsString, Length, Max, Min, MinLength } from 'class-validator';

export class CreateReviewDto {
  @IsString() @MinLength(10) @Length(10, 100) publicToken: string;
  @IsInt() @Min(1) @Max(5) rating: number;
  @IsString() @MinLength(10) @Length(10, 800) comment: string;
}

export class ModerateReviewDto {
  @IsIn(['APPROVED', 'REJECTED']) status: 'APPROVED' | 'REJECTED';
}
