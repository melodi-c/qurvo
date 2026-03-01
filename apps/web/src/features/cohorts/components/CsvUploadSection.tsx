import { useRef } from 'react';
import { Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useLocalTranslation } from '@/hooks/use-local-translation';
import { useUploadCohortCsv } from '../hooks/use-cohorts';
import { extractApiErrorMessage } from '@/lib/utils';
import translations from './CsvUploadSection.translations';

interface CsvUploadSectionProps {
  cohortId: string;
}

export function CsvUploadSection({ cohortId }: CsvUploadSectionProps) {
  const { t } = useLocalTranslation(translations);
  const uploadMutation = useUploadCohortCsv();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {return;}

    if (!file.name.endsWith('.csv')) {
      toast.error(t('uploadCsvInvalidFormat'));
      e.target.value = '';
      return;
    }

    const csvContent = await file.text();
    e.target.value = '';

    try {
      await uploadMutation.mutateAsync({ cohortId, csvContent });
      toast.success(t('uploadCsvSuccess'));
    } catch (err) {
      toast.error(extractApiErrorMessage(err, t('uploadCsvFailed')));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Upload className="h-5 w-5 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium">{t('uploadCsvTitle')}</p>
          <p className="text-xs text-muted-foreground">{t('uploadCsvDescription')}</p>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={handleFileChange}
      />

      <Button
        variant="outline"
        size="sm"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploadMutation.isPending}
      >
        <Upload className="h-4 w-4 mr-2" />
        {t('uploadCsvButton')}
      </Button>
    </div>
  );
}
