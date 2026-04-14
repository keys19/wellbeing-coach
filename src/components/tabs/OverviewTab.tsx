export default function OverviewTab() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="p-6 bg-white rounded-lg shadow-md">
        <h2 className="text-lg font-semibold mb-2">Personality Traits</h2>
        <p className="text-sm text-gray-500 mb-4">
          Key personality dimensions based on your interactions
        </p>

        {[
          'Open-mindedness',
          'Conscientiousness',
          'Extraversion',
          'Agreeableness',
          'Neuroticism',
        ].map((trait) => (
          <div key={trait} className="mb-4">
            <p className="text-sm font-medium text-gray-700">{trait}</p>
            <div className="w-full h-2 bg-gray-200 rounded-full mt-1">
              <div
                className="h-full bg-blue-600 rounded-full"
                style={{ width: '50%' }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="p-6 bg-white rounded-lg shadow-md">
        <h2 className="text-lg font-semibold mb-2">Emotional Well-being Trend</h2>
        <p className="text-sm text-gray-500 mb-4">
          Sentiment analysis from your conversations
        </p>
        <div className="flex items-center justify-center h-40 text-gray-400">
          <p>Sentiment Trend Chart<br />(Visualization will appear as more data is collected)</p>
        </div>
      </div>
    </div>
  );
}
