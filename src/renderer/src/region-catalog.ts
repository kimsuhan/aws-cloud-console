export interface RegionOption {
  city: string
  code: string
}

export interface RegionGroup {
  label: string
  options: RegionOption[]
}

export const regionGroups: RegionGroup[] = [
  {
    label: 'United States',
    options: [
      { city: 'N. Virginia', code: 'us-east-1' },
      { city: 'Ohio', code: 'us-east-2' },
      { city: 'California', code: 'us-west-1' },
      { city: 'Oregon', code: 'us-west-2' }
    ]
  },
  {
    label: 'Asia Pacific',
    options: [
      { city: 'Mumbai', code: 'ap-south-1' },
      { city: 'Osaka', code: 'ap-northeast-3' },
      { city: 'Seoul', code: 'ap-northeast-2' },
      { city: 'Singapore', code: 'ap-southeast-1' },
      { city: 'Sydney', code: 'ap-southeast-2' },
      { city: 'Tokyo', code: 'ap-northeast-1' }
    ]
  },
  {
    label: 'Canada',
    options: [{ city: 'Central', code: 'ca-central-1' }]
  },
  {
    label: 'Europe',
    options: [
      { city: 'Frankfurt', code: 'eu-central-1' },
      { city: 'Ireland', code: 'eu-west-1' },
      { city: 'London', code: 'eu-west-2' },
      { city: 'Paris', code: 'eu-west-3' },
      { city: 'Stockholm', code: 'eu-north-1' }
    ]
  },
  {
    label: 'South America',
    options: [{ city: 'Sao Paulo', code: 'sa-east-1' }]
  }
]

export function findRegionOption(code: string): { group: string; city: string; code: string } | null {
  for (const group of regionGroups) {
    const option = group.options.find((candidate) => candidate.code === code)
    if (option) {
      return {
        group: group.label,
        city: option.city,
        code: option.code
      }
    }
  }

  return null
}
